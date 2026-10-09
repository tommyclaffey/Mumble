import { suggestTasks, titleFrom, type Meeting, type Speaker, type TranscriptLine } from '../data/model';
import type { DiarizeResult } from '../record/diarizer';

/**
 * Mumble for Mac — the web app's side of it.
 *
 * Inside the Mac app (desktop/), the window shows this same web app. The app
 * records a call as two tracks — your mic and the Mac's sound — and
 * transcribes both on the Mac. This file turns that into a meeting:
 *
 *   · every line from your mic is "You" (confirmed: it's your mic)
 *   · the other track's lines go through Meeting mode to split
 *     Speaker 1, Speaker 2…
 *
 * Nothing here runs on the website: `desktop()` is null there.
 */

/** One sentence the Mac heard, as desktop/…/Transcriber.swift writes it. */
export interface HeardLine { start: number; end: number; text: string }

/** A finished call, as GET /desktop/pending returns it. */
export interface DesktopCall {
  id: string;
  app: string | null;
  startedAt: string;
  durationSeconds: number;
  othersHeard: boolean;
  you: HeardLine[];
  others: HeardLine[];
}

interface Bridge { postMessage(m: { type: string }): void }

/** The Mac app, or null on the website. */
export function desktop(): { send(type: 'record' | 'stop'): void } | null {
  const w = window as unknown as { mumbleDesktop?: unknown; webkit?: { messageHandlers?: { mumble?: Bridge } } };
  if (!w.mumbleDesktop) return null;
  return { send: (type) => w.webkit?.messageHandlers?.mumble?.postMessage({ type }) };
}

export const captureIdFor = (call: DesktopCall) => call.id;
export const audioUrl = (call: DesktopCall, file: 'mix.m4a' | 'others.m4a') => `/desktop/rec/${encodeURIComponent(call.id)}/${file}`;

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Lines on YOUR track that are really the other side, leaking out of the
 * speakers into your mic. Without headphones the same sentence shows up on
 * both tracks; it belongs to them. A line of yours is dropped when it
 * overlaps one of theirs in time and shares most of its words.
 */
export function dropEchoes(you: HeardLine[], others: HeardLine[]): HeardLine[] {
  return you.filter((y) => {
    const yw = words(y.text);
    if (yw.length === 0) return false;
    return !others.some((o) => {
      const overlaps = y.start < o.end + 1.5 && o.start < y.end + 1.5;
      if (!overlaps) return false;
      const ow = new Set(words(o.text));
      const shared = yw.filter((w) => ow.has(w)).length;
      return shared / yw.length >= 0.6;
    });
  });
}

const YOU: Speaker = { id: 'you', name: 'You', voiceprintId: 'mic', colorIndex: 0, confirmed: true };

/**
 * The meeting. `voices` is Meeting mode's answer for the OTHER track's lines
 * (null = it couldn't run: everyone else is one unconfirmed "Speaker 1",
 * flagged so "Who is this?" offers to fix it).
 */
export function meetingFromCall(
  call: DesktopCall,
  voices: DiarizeResult | null,
  opts: { stored: boolean; peaks?: number[]; taskHints: boolean },
): Meeting {
  const mine = dropEchoes(call.you, call.others);
  const count = call.others.length === 0 ? 0 : voices ? voices.count : 1;
  const theirs: Speaker[] = Array.from({ length: count }, (_, i) => ({
    id: `s${i + 1}`, name: `Speaker ${i + 1}`, voiceprintId: `v${i + 1}`, colorIndex: ((i + 1) % 5) as Speaker['colorIndex'],
  }));
  const heard = [
    ...mine.map((l) => ({ l, speakerId: YOU.id, confidence: 1 })),
    ...call.others.map((l, i) => ({
      l,
      speakerId: `s${(voices ? voices.speaker[i] : 0) + 1}`,
      confidence: voices ? voices.confidence[i] : 0.5,
    })),
  ].sort((a, b) => a.l.start - b.l.start);
  const lines: TranscriptLine[] = heard.map((h, i) => ({
    id: `l${i + 1}`, speakerId: h.speakerId, text: h.l.text, startsAt: Math.round(h.l.start * 10) / 10, confidence: h.confidence,
  }));
  const speakers = [...(mine.length ? [YOU] : []), ...theirs];
  const fallback = call.app ? `${call.app} call` : 'Call';
  return {
    kind: 'meeting',
    id: captureIdFor(call),
    source: 'desktop',
    audio: opts.stored ? 'stored' : undefined,
    peaks: opts.peaks,
    title: titleFrom(lines, fallback),
    createdAt: call.startedAt,
    durationSeconds: call.durationSeconds,
    lines,
    speakers,
    attendees: speakers.map((s) => s.name),
    tasks: opts.taskHints ? suggestTasks(lines) : [],
    tags: call.app ? [call.app] : [],
  };
}

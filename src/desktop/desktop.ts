import { suggestTasks, titleFrom, type Meeting, type Note, type Speaker, type TranscriptLine } from '../data/model';
import { sentence, type Recognizer } from '../record/recognizer';
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
  /** 'note' = just you (mic only). Absent on calls from before notes: a meeting. */
  kind?: 'note' | 'meeting';
  app: string | null;
  startedAt: string;
  durationSeconds: number;
  othersHeard: boolean;
  you: HeardLine[];
  others: HeardLine[];
}

interface Bridge { postMessage(m: { type: string; [k: string]: unknown }): void }

/** The Mac app, or null on the website. */
export type MacMessage = 'record' | 'pause' | 'resume' | 'stop' | 'discard' | 'dictate-start' | 'dictate-stop';
export function desktop(): { send(type: MacMessage, extra?: Record<string, unknown>): void } | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { mumbleDesktop?: unknown; webkit?: { messageHandlers?: { mumble?: Bridge } } };
  if (!w.mumbleDesktop) return null;
  return { send: (type, extra) => w.webkit?.messageHandlers?.mumble?.postMessage({ type, ...extra }) };
}

/**
 * The 🎤 buttons, inside the Mac app: the Mac listens and transcribes
 * (Dictation.swift, Apple's on-device speech) instead of the web view's
 * speech engine, which needs a permission the app doesn't ask for. Same
 * interface as the browser's, so every 🎤 works unchanged.
 */
export function macRecognizer(): Recognizer {
  const app = desktop();
  if (!app) return { available: false, start() {}, stop() {} };
  let listener: ((e: Event) => void) | null = null;
  const off = () => { if (listener) window.removeEventListener('mumble:desktop-dictate', listener); listener = null; };
  return {
    available: true,
    start(events) {
      off();
      listener = (e) => {
        const d = (e as CustomEvent<{ text?: string; final?: boolean; error?: string }>).detail ?? {};
        if (d.error) { off(); events.onError(d.error); return; }
        if (d.final) {
          off();
          if (d.text?.trim()) events.onFinal({ text: sentence(d.text), confidence: 1 });
          else events.onError('Nothing was heard. Try again, a little closer to the mic.');
          return;
        }
        events.onInterim(d.text ?? '');
      };
      window.addEventListener('mumble:desktop-dictate', listener);
      app.send('dictate-start');
    },
    stop() {
      if (!listener) return;
      off();
      app.send('dictate-stop');
    },
  };
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

/** A note recorded on the Mac: just you, so no speakers and nothing to tell apart. */
export function noteFromCall(call: DesktopCall, opts: { stored: boolean; peaks?: number[]; taskHints: boolean }): Note {
  const lines: TranscriptLine[] = call.you.map((l, i) => ({
    id: `l${i + 1}`, text: l.text, startsAt: Math.round(l.start * 10) / 10, confidence: 1,
  }));
  return {
    kind: 'note',
    id: captureIdFor(call),
    source: 'desktop',
    audio: opts.stored ? 'stored' : undefined,
    peaks: opts.peaks,
    title: titleFrom(lines, 'Note'),
    createdAt: call.startedAt,
    durationSeconds: call.durationSeconds,
    lines,
    tasks: opts.taskHints ? suggestTasks(lines) : [],
    tags: [],
  };
}

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

/**
 * Mumble — the domain.
 *
 * Written before any screen, because the design already surfaced one modelling
 * mistake and it is cheaper to fix here than in sixteen screens.
 *
 * ⭐ THE ONE THAT MATTERS: a note and a meeting are NOT the same object.
 *
 * In the Figma file they render as the same screen. Transcript Review assumes
 * a meeting — speakers, attendees, diarization — while the Home Feed calls
 * everything "Mumbles", which are solo captures with none of that. Building
 * one type with optional fields everywhere is how that ambiguity becomes
 * permanent. So `kind` is a required discriminant and the compiler enforces
 * which fields exist.
 *
 * The screen decision that follows (Phase 3 backlog, direction 1): ONE capture
 * screen, TWO states. The difference is a property of the capture, not a
 * different part of the app.
 */

export type CaptureKind = 'note' | 'meeting';

export interface Speaker {
  id: string;
  /** Editable — diarization guesses, the user corrects. */
  name: string;
  /** The voiceprint this speaker was matched on. */
  voiceprintId: string;
  colorIndex: 0 | 1 | 2 | 3 | 4;
  /**
   * The user has said who this voice is. A confirmed speaker's lines are no
   * longer "low confidence" — a person vouched for them, so the model's
   * doubt stops being the most important fact about them.
   */
  confirmed?: boolean;
}

/**
 * A line of transcript.
 *
 * ⭐ `confidence` is not decoration. Diarization is least accurate in the first
 * seconds of a recording, before there is enough audio to build a voiceprint —
 * so the earliest turns are the most likely to be attributed to the wrong
 * person, and they are also the ones a reader trusts most because they are at
 * the top. Surfacing the number is the product's transparency claim.
 */
export interface TranscriptLine {
  id: string;
  /** Absent on a note — a solo capture has no speaker to attribute. */
  speakerId?: string;
  text: string;
  /** Seconds from the start of the recording. Seeking to a line seeks here. */
  startsAt: number;
  /** 0–1 from the diarizer. Below LOW_CONFIDENCE the UI must say so. */
  confidence: number;
}

export const LOW_CONFIDENCE = 0.75;

/**
 * Only a SPEAKER attribution can be low confidence. A note has no speaker, so
 * there is nothing to doubt — which is why a note never shows the chip even
 * when the recogniser's word confidence is low.
 */
export function isLowConfidence(line: TranscriptLine, speaker?: Speaker): boolean {
  if (line.speakerId === undefined) return false;
  if (speaker?.confirmed) return false;
  return line.confidence < LOW_CONFIDENCE;
}

export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  text: string;
  /** The line it was extracted from — every AI claim points at its evidence. */
  sourceLineId: string;
  /** Unassigned is a real state, not a missing value. */
  assignee?: string;
  status: TaskStatus;
  /** "2026-10-03" — a date, no time. The design's "Due date" chip. */
  due?: string;
  /** Typed or said by you, not found in the recording. Shown as "Added by
      you", so a task you wrote is never mistaken for one the model found. */
  manual?: boolean;
}

interface CaptureBase {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  lines: TranscriptLine[];
  tasks: Task[];
  tags: string[];
  /**
   * Model-written. Kept separate from lines so it is always separable in UI.
   * Absent is honest: a capture recorded in the browser demo has no model
   * behind it, so it has no summary rather than a fake one.
   */
  summary?: string;
  /** Where the capture came from. 'desktop' = a call recorded by the Mac
      app, transcribed on the Mac (src/desktop/). */
  source: 'demo' | 'browser' | 'desktop';
  /** Who pressed record — a teammate's name, in a team workspace. Absent
      means you: everything recorded in this browser is yours. */
  recordedBy?: string;
  /**
   * Where its RECORDING lives. A capture is a recording first and a
   * transcript second — play means "play what was said".
   *   · 'demo'   a static file shipped with the app (public/demo-audio/)
   *   · 'stored' recorded in this browser, kept in IndexedDB
   *   · absent   no audio (a recording made where the browser couldn't save it)
   */
  audio?: 'demo' | 'stored';
  /** Where listening stopped last time, in seconds. Play resumes here; the
      track shows it as the blue "listened" part, as in the design. */
  listenedTo?: number;
  /** The recording's loudness, 0–1, in even slices — what the waveform draws.
      Measured from the real audio (demo: scripts/make-demo-peaks.mjs; your
      recordings: at save). Absent = no waveform, the plain track instead. */
  peaks?: number[];
}

/** A solo capture. No speakers, so no diarization and no attendees. */
export interface Note extends CaptureBase {
  kind: 'note';
}

/** Multiple people. Speakers exist, which is what everything else hangs off. */
export interface Meeting extends CaptureBase {
  kind: 'meeting';
  speakers: Speaker[];
  /** Names as they appear on the calendar invite. */
  attendees: string[];
}

export type Capture = Note | Meeting;

/** Narrowing helper so screens branch on the type rather than on truthiness. */
export function isMeeting(c: Capture): c is Meeting {
  return c.kind === 'meeting';
}

export function speakerFor(c: Capture, line: TranscriptLine): Speaker | undefined {
  return isMeeting(c) ? c.speakers.find((s) => s.id === line.speakerId) : undefined;
}

/** Lines in this speaker's VOICE — what a correction to them will change. */
export function linesBySpeaker(m: Meeting, speakerId: string): number {
  const vp = m.speakers.find((s) => s.id === speakerId)?.voiceprintId;
  if (vp === undefined) return 0;
  const inVoice = new Set(m.speakers.filter((s) => s.voiceprintId === vp).map((s) => s.id));
  return m.lines.filter((l) => l.speakerId !== undefined && inVoice.has(l.speakerId)).length;
}

/**
 * Correcting a speaker fixes every line that shares the voice, not just the
 * one that was clicked.
 *
 * This is the whole feature. Diarization gets a person wrong consistently —
 * it decided turn 1 was "Speaker 3" and then matched that voiceprint forty
 * more times. Fixing one line and leaving thirty-nine wrong is a correction
 * that costs more than it saves, so the fix propagates by voice.
 *
 * Two cases:
 *   · the name is new       → the speaker is renamed, every line follows
 *   · the name already exists → the diarizer split one person into two voices.
 *                               The lines MERGE into the existing speaker and
 *                               the duplicate is removed, so the attendee list
 *                               never shows the same person twice.
 *
 * Returns how many lines changed, because the UI has to say it — a silent
 * bulk edit is a claim the user cannot check.
 */
export function correctSpeaker(
  meeting: Meeting, speakerId: string, rawName: string,
): { meeting: Meeting; linesChanged: number } {
  const name = rawName.trim();
  const source = meeting.speakers.find((s) => s.id === speakerId);
  if (!source || name === '') return { meeting, linesChanged: 0 };

  /* Nothing to change: renaming someone to the name they already have. */
  if (source.name.toLowerCase() === name.toLowerCase() && source.confirmed) return { meeting, linesChanged: 0 };

  /* Count every line in the VOICE, not just the clicked speaker id — two ids
     can share a voiceprint, and the preview must match what actually changes. */
  const inVoice = new Set(meeting.speakers.filter((s) => s.voiceprintId === source.voiceprintId).map((s) => s.id));
  const linesChanged = meeting.lines.filter((l) => l.speakerId !== undefined && inVoice.has(l.speakerId)).length;
  const existing = meeting.speakers.find(
    (s) => s.id !== speakerId && s.name.toLowerCase() === name.toLowerCase(),
  );
  /* The attendee list follows: in a meeting recorded in the browser it starts
     as "Speaker 1, Speaker 2…", and naming a voice names the attendee. */
  const oldNames = new Set(meeting.speakers.filter((s) => inVoice.has(s.id)).map((s) => s.name));
  const attendeesAs = (to: string) => [...new Set(meeting.attendees.map((a) => (oldNames.has(a) ? to : a)))];

  if (existing) {
    return {
      linesChanged,
      meeting: {
        ...meeting,
        attendees: attendeesAs(existing.name),
        speakers: meeting.speakers
          .filter((s) => s.id === existing.id || !inVoice.has(s.id))
          .map((s) => (s.id === existing.id ? { ...s, confirmed: true } : s)),
        lines: meeting.lines.map((l) =>
          l.speakerId !== undefined && inVoice.has(l.speakerId) && l.speakerId !== existing.id ? { ...l, speakerId: existing.id } : l),
      },
    };
  }

  return {
    linesChanged,
    meeting: {
      ...meeting,
      attendees: attendeesAs(name),
      speakers: meeting.speakers.map((s) =>
        s.voiceprintId === source.voiceprintId ? { ...s, name, confirmed: true } : s),
    },
  };
}

/** Consecutive lines by one speaker read as one turn, under one header. */
export interface Turn { speakerId?: string; lines: { line: TranscriptLine; index: number }[] }

export function turnsOf(c: Capture): Turn[] {
  const turns: Turn[] = [];
  c.lines.forEach((line, index) => {
    const last = turns[turns.length - 1];
    if (last && last.speakerId === line.speakerId) last.lines.push({ line, index });
    else turns.push({ speakerId: line.speakerId, lines: [{ line, index }] });
  });
  return turns;
}

/* ---------------------------------------------------------- read aloud -- */

/**
 * Playback position, stated as a place in the text.
 *
 * "Line 4 of 18" rather than a scrubber at 00:42. Someone who is listening
 * *because* reading is hard cannot use a timeline to find their place in a
 * document — the timeline describes the audio, and what they need described
 * is the text. This is the dyslexia origin story answered in the product,
 * so the position type is text-first.
 */
export interface ReadPosition {
  lineIndex: number;
  totalLines: number;
}

export function positionLabel(p: ReadPosition): string {
  if (p.totalLines === 0) return 'Nothing to read';
  return `Line ${p.lineIndex + 1} of ${p.totalLines}`;
}

/** 0–100 through the text. Line-based, for the same reason as the label. */
export function readPercent(p: ReadPosition): number {
  if (p.totalLines <= 1) return p.totalLines === 1 ? 100 : 0;
  return Math.round((p.lineIndex / (p.totalLines - 1)) * 100);
}

/** The line being spoken at a moment in the recording — drives the highlight. */
export function lineAt(c: Capture, second: number): number {
  let i = 0;
  while (i + 1 < c.lines.length && c.lines[i + 1].startsAt <= second) i += 1;
  return i;
}

/* ------------------------------------------------------------- derived -- */

export function wordCount(c: Capture): number {
  return c.lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
}

export function openTasks(c: Capture): number {
  return c.tasks.filter((t) => t.status !== 'done').length;
}

export function taskForLine(c: Capture, lineId: string): Task | undefined {
  return c.tasks.find((t) => t.sourceLineId === lineId);
}

/** "4:32" or "1:02:10". Durations are columns of digits — see .mb-tabular. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Recording timer: always hours, so the digits never reflow mid-recording. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "Today · 2:34 PM", "Yesterday · 9:10 AM", "Sep 22 · 4:00 PM". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

/* -------------------------------------------------------- task finding -- */

/**
 * Task suggestion without a model.
 *
 * ⚠️ This is a RULE, not AI, and the UI says so ("Suggested by phrasing").
 * Captures recorded in the browser demo have no model behind them; a phrase
 * rule that is honest about being a phrase rule beats a fake "AI found 3
 * tasks". The demo captures carry model-extracted tasks and are labelled as
 * such.
 */
const TASK_OPENERS = /^(?:okay,?\s+|so,?\s+|and\s+)?(we need to|we should|i need to|i have to|let'?s|follow up|schedule|send|remind me to|make sure|don'?t forget to)\b/i;

export function suggestTasks(lines: TranscriptLine[]): Task[] {
  return lines
    .filter((l) => TASK_OPENERS.test(l.text.trim()))
    .map((l, i) => ({
      id: `t-${l.id}-${i}`,
      text: tidyTask(l.text),
      sourceLineId: l.id,
      status: 'todo' as const,
    }));
}

function tidyTask(text: string): string {
  const t = text.trim().replace(/^(?:okay,?\s+|so,?\s+|and\s+)/i, '').replace(/[.!]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A title from the first words, so a fresh capture is never "Untitled". */
export function titleFrom(lines: TranscriptLine[], fallback: string): string {
  const first = lines[0]?.text.trim();
  if (!first) return fallback;
  const words = first.replace(/[.!?,]+$/, '').split(/\s+/);
  return words.length <= 7 ? words.join(' ') : `${words.slice(0, 7).join(' ')}…`;
}

/* ---------------------------------------------------------- export -- */

export function toMarkdown(c: Capture): string {
  const out: string[] = [`# ${c.title}`, '', `${formatWhen(c.createdAt)} · ${formatDuration(c.durationSeconds)}`];
  if (isMeeting(c) && c.attendees.length) out.push(`Attendees: ${c.attendees.join(', ')}`);
  if (c.summary) out.push('', '## Summary (AI-generated)', '', c.summary);
  if (c.tasks.length) {
    out.push('', '## Tasks', '');
    for (const t of c.tasks) {
      out.push(`- [${t.status === 'done' ? 'x' : ' '}] ${t.text}${t.assignee ? ` — ${t.assignee}` : ''}`);
    }
  }
  out.push('', '## Transcript', '');
  for (const l of c.lines) {
    const who = speakerFor(c, l)?.name;
    out.push(`[${formatDuration(l.startsAt)}] ${who ? `**${who}:** ` : ''}${l.text}`);
  }
  return out.join('\n') + '\n';
}

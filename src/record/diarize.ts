/**
 * Telling voices apart — the arithmetic, with no models in it.
 *
 * Meeting mode runs two small models in the browser (diarize.worker.ts):
 * one finds WHEN each voice speaks, in 10-second windows; the other turns
 * each voice into a voiceprint, a list of numbers that's similar for the same
 * person. Everything after that is here, and it's plain maths, so it's tested
 * without loading anything:
 *
 *   groupVoices     voiceprints → people (the same person across windows)
 *   fitOf           how clearly each voiceprint belongs to its person
 *   linesToSpeakers people-in-time → who said each transcript line, and how sure
 *
 * Measured Oct 7 on the 4 demo meetings (scripts/speaker-test.mjs on the
 * speaker-test branch): right person on 94% of lines when told how many
 * people were there, 89% guessing. The demo voices are synthetic and clean,
 * so real meetings will do worse. That's why every line carries a confidence
 * and an unsure voice asks "Who is this?" instead of pretending.
 */

/** A stretch of one voice: when, and which person it was grouped into. */
export interface VoiceSpan { start: number; end: number; who: number; fit: number }

/* Chosen before any result was looked at (and kept): when the number of people
   isn't known, two voiceprints at least this similar are one person. */
export const SAME_PERSON = 0.5;

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
export const unit = (v: number[]) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };

/**
 * Average-linkage grouping: keep joining the two most similar groups until
 * there are `people` of them, or — if nobody said how many — until the
 * closest two are less alike than SAME_PERSON.
 */
export function groupVoices(prints: number[][], people: number | null): { label: number[]; count: number } {
  const clusters = prints.map((_, i) => [i]);
  const sim = (A: number[], B: number[]) => {
    let s = 0;
    for (const a of A) for (const b of B) s += dot(prints[a], prints[b]);
    return s / (A.length * B.length);
  };
  while (clusters.length > 1) {
    if (people && clusters.length <= people) break;
    let best: [number, number, number] = [0, 1, -Infinity];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = sim(clusters[i], clusters[j]);
        if (s > best[2]) best = [i, j, s];
      }
    }
    if (!people && best[2] < SAME_PERSON) break;
    clusters[best[0]] = clusters[best[0]].concat(clusters[best[1]]);
    clusters.splice(best[1], 1);
  }
  const label = new Array<number>(prints.length);
  clusters.forEach((c, ci) => c.forEach((i) => { label[i] = ci; }));
  return { label, count: clusters.length };
}

/**
 * How clearly each voiceprint belongs to the person it was put with, 0–1:
 * its similarity to every person's average voice, as a softmax. A voice that
 * sits between two people scores near 0.5 and gets flagged.
 */
export function fitOf(prints: number[][], label: number[], count: number): number[] {
  const centres = Array.from({ length: count }, (_, k) => {
    const members = prints.filter((_, i) => label[i] === k);
    return unit(members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0)));
  });
  return prints.map((p, i) => {
    if (count < 2) return 1;
    const e = centres.map((c) => Math.exp(dot(p, c) / 0.1));
    return e[label[i]] / e.reduce((s, x) => s + x, 0);
  });
}

/**
 * Who said each line. A line runs from its start to the next line's start;
 * it goes to whoever the model heard most in that time. Its confidence is
 * how much of that time was theirs × how clearly their voice fit.
 *
 * People are renumbered in the order they first speak, so "Speaker 1" is
 * whoever talked first — and a group no line ended up with isn't a person.
 *
 * ⚠️ Line start times in a browser recording are estimates (the speech
 * service reports a phrase when it ends), so a line near a change of speaker
 * can catch the wrong voice. The confidence is what says so.
 */
export function linesToSpeakers(
  starts: number[], duration: number, spans: VoiceSpan[],
): { speaker: number[]; confidence: number[]; count: number } {
  const raw = starts.map((a, i) => {
    const b = Math.max(a + 0.1, starts[i + 1] ?? duration);
    const time = new Map<number, { t: number; fit: number }>();
    let voiced = 0;
    for (const s of spans) {
      const t = Math.min(b, s.end) - Math.max(a, s.start);
      if (t <= 0) continue;
      voiced += t;
      const cur = time.get(s.who) ?? { t: 0, fit: 0 };
      time.set(s.who, { t: cur.t + t, fit: cur.fit + s.fit * t });
    }
    const top = [...time.entries()].sort((x, y) => y[1].t - x[1].t)[0];
    if (top) return { who: top[0], confidence: (top[1].t / voiced) * (top[1].fit / top[1].t) };
    /* Nothing heard in the line's time (its estimated start was off): the
       nearest voice, and low confidence so it gets checked. */
    const mid = (a + b) / 2;
    const near = [...spans].sort((x, y) => Math.abs((x.start + x.end) / 2 - mid) - Math.abs((y.start + y.end) / 2 - mid))[0];
    return { who: near?.who ?? 0, confidence: 0.4 };
  });

  const order: number[] = [];
  for (const r of raw) if (!order.includes(r.who)) order.push(r.who);
  return {
    speaker: raw.map((r) => order.indexOf(r.who)),
    confidence: raw.map((r) => Math.round(Math.max(0, Math.min(1, r.confidence)) * 100) / 100),
    count: order.length,
  };
}

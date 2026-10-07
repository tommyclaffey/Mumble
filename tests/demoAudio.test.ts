import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { teamCaptures } from '../src/data/teamDemo';
import timings from '../src/data/demoAudio.json';

/**
 * The demo recordings must match their transcripts. If a demo line is edited
 * and the audio isn't regenerated (node scripts/make-demo-audio.mjs, or
 * ONLY=<id> to remake just one), the
 * highlight would follow the wrong words — this catches it.
 */
const T = timings as Record<string, { duration: number; starts: number[] }>;

describe('demo recordings', () => {
  /* The team demo's recordings include the personal demo's five. */
  for (const c of teamCaptures(new Date())) {
    it(`${c.id} has audio whose timings fit its transcript`, () => {
      const t = T[c.id];
      expect(t, 'regenerate with node scripts/make-demo-audio.mjs').toBeDefined();
      expect(t.starts).toHaveLength(c.lines.length);
      t.starts.forEach((s, i) => { if (i) expect(s).toBeGreaterThan(t.starts[i - 1]); });
      expect(t.duration).toBeGreaterThan(t.starts.at(-1)!);
      const file = join(process.cwd(), 'public', 'demo-audio', `${c.id}.m4a`);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(10_000);
    });
  }
});

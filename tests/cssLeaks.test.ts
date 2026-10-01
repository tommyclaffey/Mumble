import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No raw hex colours outside tokens.css.
 *
 * The Figma file started with 249 Tailwind strays — hardcoded values that
 * looked right and drifted. The code holds the same line: a colour is a
 * token, or it is a defect.
 */
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

describe('css', () => {
  it('no hex colours outside tokens.css', () => {
    const offenders = cssFiles(join(process.cwd(), 'src'))
      .filter((f) => !f.endsWith('tokens.css'))
      .flatMap((f) => (readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((m) => `${f}: ${m}`));
    expect(offenders).toEqual([]);
  });
});

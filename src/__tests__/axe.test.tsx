// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { initialState, StoreProvider } from '../data/store';
import { ServicesProvider } from '../services';
import { fakeAudioFactory, fakeMic, fakeRecognizer, memoryAudioStore } from './fakes';

/**
 * Automated accessibility check on every screen (axe-core, the engine behind
 * most accessibility audits).
 *
 * It catches the mechanical failures — a control with no name, a broken ARIA
 * attribute, a duplicate id, a list with non-list children. It can't judge
 * colour contrast here (jsdom has no layout), and it can't tell whether the
 * experience is GOOD. It's a floor, not a verdict.
 */

afterEach(cleanup);

const SCREENS = ['#/recent', '#/capture/c1', '#/capture/c2', '#/record', '#/tasks', '#/tags', '#/tags/Product', '#/meetings', '#/settings'];

async function violations(hash: string) {
  window.location.hash = hash;
  const { container } = render(
    <StoreProvider initial={initialState(new Date())}>
      <ServicesProvider makeAudio={fakeAudioFactory().make} audioStore={memoryAudioStore()} mic={fakeMic().make} recognizer={fakeRecognizer().make}>
        <App />
      </ServicesProvider>
    </StoreProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },  // needs real layout — checked separately
      region: { enabled: false },             // container isn't the full document
    },
  });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

describe('axe — no mechanical accessibility failures', () => {
  for (const hash of SCREENS) {
    it(hash, async () => {
      expect(await violations(hash)).toEqual([]);
    });
  }
});

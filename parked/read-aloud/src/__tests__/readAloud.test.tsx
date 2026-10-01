// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useReadAloud } from '../readAloud/useReadAloud';
import { fakeSpeech } from './fakes';

afterEach(cleanup);
const LINES = ['one', 'two', 'three'];

function setup(opts = { rate: 1 }) {
  const s = fakeSpeech();
  const hook = renderHook(({ lines, o, key }) => useReadAloud(lines, s.engine, o, key), {
    initialProps: { lines: LINES, o: opts, key: 'doc-a' },
  });
  return { s, hook };
}

describe('read-aloud', () => {
  it('reads one line at a time and advances when a line finishes', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.play());
    expect(s.spoken.map((x) => x.text)).toEqual(['one']);
    expect(hook.result.current.index).toBe(0);
    act(() => s.finish());
    expect(s.spoken.map((x) => x.text)).toEqual(['one', 'two']);
    expect(hook.result.current.index).toBe(1);
  });

  it('pausing does NOT skip a line (a cancelled utterance is not a finished one)', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.play());
    act(() => hook.result.current.pause());
    expect(hook.result.current.playing).toBe(false);
    expect(hook.result.current.index).toBe(0);
    expect(s.spoken).toHaveLength(1);
    /* Resume restarts the SAME line from its first word. */
    act(() => hook.result.current.play());
    expect(s.spoken.map((x) => x.text)).toEqual(['one', 'one']);
  });

  it('seeking while playing jumps exactly once', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.play());
    act(() => hook.result.current.seek(2));
    expect(hook.result.current.index).toBe(2);
    expect(s.spoken.map((x) => x.text)).toEqual(['one', 'three']);
  });

  it('seeking while paused only moves the position', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.seek(1));
    expect(hook.result.current.index).toBe(1);
    expect(s.spoken).toHaveLength(0);
    act(() => hook.result.current.seek(99));
    expect(hook.result.current.index).toBe(2);
  });

  it('parks on the last line when finished, and play restarts from the top', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.play());
    act(() => s.finish());
    act(() => s.finish());
    act(() => s.finish());
    expect(hook.result.current.playing).toBe(false);
    expect(hook.result.current.finished).toBe(true);
    expect(hook.result.current.index).toBe(2);
    act(() => hook.result.current.play());
    expect(s.spoken[s.spoken.length - 1].text).toBe('one');
  });

  it('play(from) starts at that line', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.play(1));
    expect(s.spoken.map((x) => x.text)).toEqual(['two']);
  });

  it('changing speed mid-line restarts the line at the new speed', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.play());
    hook.rerender({ lines: LINES, o: { rate: 1.5 }, key: 'doc-a' });
    expect(s.spoken.map((x) => [x.text, x.rate])).toEqual([['one', 1], ['one', 1.5]]);
    expect(hook.result.current.index).toBe(0);
  });

  it('a different document stops and resets to its first line', () => {
    const { hook } = setup();
    act(() => hook.result.current.play(2));
    hook.rerender({ lines: ['x', 'y'], o: { rate: 1 }, key: 'doc-b' });
    expect(hook.result.current.playing).toBe(false);
    expect(hook.result.current.index).toBe(0);
  });

  it('unmounting stops the voice', () => {
    const { s, hook } = setup();
    act(() => hook.result.current.play());
    const before = s.cancels;
    hook.unmount();
    expect(s.cancels).toBeGreaterThan(before);
  });

  it('does nothing when the browser has no voice', () => {
    const s = fakeSpeech(false);
    const { result } = renderHook(() => useReadAloud(LINES, s.engine, { rate: 1 }));
    act(() => result.current.play());
    expect(result.current.playing).toBe(false);
    expect(s.spoken).toHaveLength(0);
  });
});

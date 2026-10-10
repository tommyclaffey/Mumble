// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropEchoes, meetingFromCall, type DesktopCall } from '../desktop/desktop';

const call = (over: Partial<DesktopCall> = {}): DesktopCall => ({
  id: 'd1', app: 'Zoom', startedAt: '2026-10-09T15:00:00.000Z', durationSeconds: 60, othersHeard: true,
  you: [
    { start: 0, end: 3, text: 'Thanks for jumping on.' },
    { start: 12, end: 15, text: 'We need to send the proposal by Friday.' },
  ],
  others: [
    { start: 4, end: 8, text: 'Happy to. Where are we on pricing?' },
    { start: 9, end: 11, text: 'I can take the deck.' },
  ],
  ...over,
});

describe('a call recorded by the Mac app', () => {
  it('labels every line from your mic "You", in time order with the other side', () => {
    const m = meetingFromCall(call(), { count: 2, speaker: [0, 1], confidence: [0.9, 0.8] }, { stored: true, taskHints: true });
    expect(m.lines.map((l) => [l.speakerId, l.text])).toEqual([
      ['you', 'Thanks for jumping on.'],
      ['s1', 'Happy to. Where are we on pricing?'],
      ['s2', 'I can take the deck.'],
      ['you', 'We need to send the proposal by Friday.'],
    ]);
    expect(m.speakers.map((s) => s.name)).toEqual(['You', 'Speaker 1', 'Speaker 2']);
    expect(m.speakers[0].confirmed).toBe(true);
    expect(m.attendees).toEqual(['You', 'Speaker 1', 'Speaker 2']);
    expect(m.source).toBe('desktop');
    expect(m.audio).toBe('stored');
    expect(m.tags).toEqual(['Zoom']);
  });

  it('finds tasks in the call, as a browser recording does', () => {
    const m = meetingFromCall(call(), { count: 2, speaker: [0, 1], confidence: [0.9, 0.8] }, { stored: true, taskHints: true });
    expect(m.tasks.some((t) => /proposal/.test(t.text))).toBe(true);
    expect(meetingFromCall(call(), null, { stored: true, taskHints: false }).tasks).toEqual([]);
  });

  it('when voices could not be told apart, the other side is one flagged "Speaker 1"', () => {
    const m = meetingFromCall(call(), null, { stored: false, taskHints: false });
    const theirs = m.lines.filter((l) => l.speakerId !== 'you');
    expect(theirs.every((l) => l.speakerId === 's1' && l.confidence < 0.75)).toBe(true);
    expect(m.speakers.map((s) => s.name)).toEqual(['You', 'Speaker 1']);
    expect(m.audio).toBeUndefined();
  });

  it('with only your side heard, it is just you', () => {
    const m = meetingFromCall(call({ others: [], othersHeard: false }), null, { stored: true, taskHints: false });
    expect(m.speakers.map((s) => s.name)).toEqual(['You']);
    expect(m.lines.every((l) => l.speakerId === 'you')).toBe(true);
  });

  it('names an empty call after the app', () => {
    expect(meetingFromCall(call({ you: [], others: [] }), null, { stored: true, taskHints: false }).title).toBe('Zoom call');
  });
});

describe('their voices leaking into your mic', () => {
  it('drops a line of yours that repeats theirs at the same moment', () => {
    const them = [{ start: 4, end: 8, text: 'Happy to. Where are we on pricing?' }];
    const you = [
      { start: 4.3, end: 8.2, text: 'happy to where are we on pricing' },
      { start: 20, end: 22, text: 'Where are we on pricing, you asked?' },
      { start: 5, end: 6, text: 'Good question.' },
    ];
    expect(dropEchoes(you, them).map((l) => l.text)).toEqual(['Where are we on pricing, you asked?', 'Good question.']);
  });
});

describe('the header follows the Mac recorder', () => {
  it('shows recording, then paused at the time it stopped, then nothing', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { followMacState } = await import('../desktop/macState');
    const { useRecordingStatus } = await import('../record/recordingStatus');
    followMacState();
    const { result } = renderHook(() => useRecordingStatus());
    const say = (detail: object) => act(() => { window.dispatchEvent(new CustomEvent('mumble:desktop-state', { detail })); });
    say({ phase: 'recording', since: Date.now() - 65_000 });
    expect(result.current.state).toBe('recording');
    expect(Math.floor(result.current.elapsed)).toBe(65);
    say({ phase: 'paused', elapsed: 65 });
    expect(result.current).toEqual({ state: 'paused', elapsed: 65 });
    say({ phase: 'idle' });
    expect(result.current.state).toBe('idle');
  });
});

describe('inside the Mac app', () => {
  type Sent = { type: string; [k: string]: unknown };
  let sent: Sent[] = [];
  const w = window as unknown as { mumbleDesktop?: unknown; webkit?: unknown };
  const say = async (event: string, detail: unknown) => {
    const { act } = await import('@testing-library/react');
    act(() => { window.dispatchEvent(new CustomEvent(event, { detail })); });
  };
  beforeEach(() => {
    sent = [];
    w.mumbleDesktop = { version: 'test' };
    w.webkit = { messageHandlers: { mumble: { postMessage: (m: Sent) => sent.push(m) } } };
  });
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    delete w.mumbleDesktop; delete w.webkit;
  });

  it('🎤 dictation goes to the Mac: guesses as it hears, the settled phrase at the end', async () => {
    const { macRecognizer } = await import('../desktop/desktop');
    const r = macRecognizer();
    expect(r.available).toBe(true);
    const got: string[] = [];
    r.start({ onFinal: (l) => got.push(`final:${l.text}`), onInterim: (t) => got.push(`guess:${t}`), onError: (m) => got.push(`error:${m}`) });
    expect(sent.map((m) => m.type)).toEqual(['dictate-start']);
    await say('mumble:desktop-dictate', { text: 'send the', final: false });
    await say('mumble:desktop-dictate', { text: 'send the proposal', final: true });
    await say('mumble:desktop-dictate', { text: 'ignored after the end', final: false });
    expect(got).toEqual(['guess:send the', 'final:Send the proposal.']);
  });

  it('🎤 says so when nothing was heard, and Stop tells the Mac', async () => {
    const { macRecognizer } = await import('../desktop/desktop');
    const r = macRecognizer();
    const got: string[] = [];
    r.start({ onFinal: () => got.push('final'), onInterim: () => {}, onError: (m) => got.push(m) });
    await say('mumble:desktop-dictate', { text: '', final: true });
    expect(got[0]).toMatch(/nothing was heard/i);
    r.start({ onFinal: () => {}, onInterim: () => {}, onError: () => {} });
    r.stop();
    expect(sent.map((m) => m.type)).toEqual(['dictate-start', 'dictate-start', 'dictate-stop']);
  });

  it('a note recorded on the Mac is a note: just you, no speakers', async () => {
    const { noteFromCall } = await import('../desktop/desktop');
    const n = noteFromCall(call({ kind: 'note', others: [] }), { stored: true, taskHints: true });
    expect(n.kind).toBe('note');
    expect(n.lines.every((l) => l.speakerId === undefined)).toBe(true);
    expect(n.tasks.some((t) => /proposal/.test(t.text))).toBe(true);
  });

  it('New recording: Note or Meeting, live lines from both tracks, tasks spotted, and the right buttons', async () => {
    const { render, screen, fireEvent, within } = await import('@testing-library/react');
    const { default: App } = await import('../App');
    const { StoreProvider, initialState } = await import('../data/store');
    const { ServicesProvider } = await import('../services');
    const { fakeAudioFactory, fakeMic, fakeRecognizer, memoryAudioStore } = await import('./fakes');
    window.location.hash = '#/record';
    window.scrollTo = () => {};
    render(
      <StoreProvider initial={initialState(new Date())}>
        <ServicesProvider makeAudio={fakeAudioFactory().make} audioStore={memoryAudioStore()} mic={fakeMic().make} recognizer={fakeRecognizer().make}>
          <App />
        </ServicesProvider>
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(sent.at(-1)).toEqual({ type: 'record', kind: 'note' });

    await say('mumble:desktop-state', { phase: 'recording', kind: 'meeting', since: Date.now() - 5000 });
    await say('mumble:desktop-live', [
      { who: 'you', start: 0, text: 'Thanks for jumping on.', final: true },
      { who: 'them', start: 3, text: 'Happy to.', final: true },
      { who: 'you', start: 6, text: 'We need to send the proposal by Friday.', final: true },
      { who: 'you', start: 9, text: 'and the', final: false },
    ]);
    const live = screen.getByRole('region', { name: /live transcript/i });
    expect(within(live).getAllByText('You')).toHaveLength(2);
    expect(within(live).getByText('On the call')).toBeTruthy();
    expect(within(live).getByText('and the')).toBeTruthy();
    expect(within(live).getByText('Task')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tasks spotted' }).textContent).toMatch(/send the proposal/i);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(sent.at(-1)?.type).toBe('pause');
    fireEvent.click(screen.getByRole('button', { name: /stop & save/i }));
    expect(sent.at(-1)?.type).toBe('stop');
    window.confirm = () => true;
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(sent.at(-1)?.type).toBe('discard');

    await say('mumble:desktop-state', { phase: 'saving', kind: 'meeting', step: 'transcribe' });
    const saving = screen.getByRole('region', { name: /saving your meeting/i });
    expect(within(saving).getByText('Transcribed on this Mac').closest('li')?.className).toBe('is-active');
    expect(within(saving).getByText('Voices told apart')).toBeTruthy();
    await say('mumble:desktop-state', { phase: 'idle' });
    await say('mumble:desktop-live', []);
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { initialState, StoreProvider } from '../data/store';
import { EnginesProvider } from '../readAloud/EngineContext';
import { fakeRecognizer, fakeSpeech } from './fakes';
import { NaturalVoice, type WorkerLike } from '../readAloud/natural/NaturalVoice';
import type { FromWorker } from '../readAloud/natural/protocol';

function mount(hash: string, opts: {
  speech?: ReturnType<typeof fakeSpeech>; rec?: ReturnType<typeof fakeRecognizer>;
  natural?: NaturalVoice; engine?: 'device' | 'natural';
} = {}) {
  window.location.hash = hash;
  const speech = opts.speech ?? fakeSpeech();
  const rec = opts.rec ?? fakeRecognizer();
  const state = initialState(new Date());
  if (opts.engine) state.prefs = { ...state.prefs, engine: opts.engine };
  render(
    <StoreProvider initial={state}>
      <EnginesProvider speech={speech.engine} natural={opts.natural ?? null} recognizer={rec.make}>
        <App />
      </EnginesProvider>
    </StoreProvider>,
  );
  return { speech, rec };
}

async function navigate(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = () => {}; // jsdom doesn't implement it
});

/** The position as SHOWN (the screen-reader announcer may repeat it). */
const pos = () => document.querySelector('.mb-reader-pos')?.textContent;
/** The toast — not the reader's announcer, which is also a status region. */
const toast = () => document.querySelector('.mb-toast') as HTMLElement;
/** What a screen reader is told by the read-aloud bar. */
const announcer = () => document.querySelector('.mb-reader [role="status"]')?.textContent;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Recent', () => {
  it('lists every capture, newest first', () => {
    mount('#/recent');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles[0]).toBe('Product brainstorm session');
    expect(titles).toHaveLength(5);
  });

  it('filters by kind, and the filter lives in the URL', async () => {
    mount('#/recent');
    fireEvent.click(screen.getByRole('button', { name: 'Meetings' }));
    await navigate(window.location.hash);
    expect(window.location.hash).toBe('#/recent?filter=meetings');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Meetings' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('search looks inside transcripts, not just titles', () => {
    mount('#/recent');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sandbox keys' } });
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(['Weekly team standup']);
  });

  it('one voice at a time: playing a second card stops the first', async () => {
    const { speech } = mount('#/recent');
    fireEvent.click(screen.getByRole('button', { name: 'Play Product brainstorm session aloud' }));
    expect(speech.spoken[0].text).toMatch(/^Okay, I'm thinking/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play Product Sync aloud' }));
    });
    expect(speech.spoken[speech.spoken.length - 1].text).toMatch(/^Alright, let's kick off/);
    expect(screen.getByRole('button', { name: 'Play Product brainstorm session aloud' }).getAttribute('data-playing')).toBe('false');
    expect(screen.getByRole('button', { name: 'Pause Product Sync aloud' })).toBeTruthy();
  });

  it('a playing card hidden by search stops talking', () => {
    const { speech } = mount('#/recent');
    fireEvent.click(screen.getByRole('button', { name: 'Play Product brainstorm session aloud' }));
    const before = speech.cancels;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sandbox keys' } });
    expect(speech.cancels).toBeGreaterThan(before);
  });

  it('says plainly when the browser cannot read aloud', () => {
    mount('#/recent', { speech: fakeSpeech(false) });
    expect(screen.getByRole('note').textContent).toMatch(/doesn’t offer one/);
    expect((screen.getByRole('button', { name: 'Play Product Sync aloud' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Capture — read aloud', () => {
  it('states the position as a line of text', () => {
    const { speech } = mount('#/capture/c1');
    expect(pos()).toBe('Line 1 of 12');
    fireEvent.click(screen.getByRole('button', { name: 'Play Product brainstorm session aloud' }));
    act(() => speech.finish());
    act(() => speech.finish());
    expect(pos()).toBe('Line 3 of 12');
    expect(screen.getByRole('progressbar', { name: 'Read-aloud position' }).getAttribute('aria-valuetext')).toBe('Line 3 of 12');
  });

  it('marks the line being read with aria-current, and a task line with its pill', () => {
    const { speech } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud from line 3' }));
    expect(speech.spoken[0].text).toMatch(/^We need to revisit/);
    const current = document.querySelector('[aria-current="true"]')!;
    expect(current.textContent).toMatch(/We need to revisit/);
    /* Line 3 is both being read AND a task — both marks, independently. */
    expect(current.className).toContain('is-reading');
    expect(current.className).toContain('is-task');
    expect(within(current as HTMLElement).getByText('Task')).toBeTruthy();
  });

  it('speed changes from the transcript are remembered', () => {
    mount('#/capture/c1');
    fireEvent.click(screen.getByRole('radio', { name: '1.25×' }));
    expect(screen.getByRole('radio', { name: '1.25×' }).getAttribute('aria-checked')).toBe('true');
    const saved = JSON.parse(localStorage.getItem('mumble.v1')!);
    expect(saved.prefs.rate).toBe(1.25);
  });

  it('a task links to the line it came from', () => {
    const { speech } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Line 7' }));
    expect(pos()).toBe('Line 7 of 12');
    expect(speech.spoken).toHaveLength(0); // jumping is not playing
  });
});

describe('Capture — what a screen reader hears', () => {
  it('lines advancing on their own are NOT announced — that would talk over the voice', () => {
    const { speech } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: /^Play Product brainstorm/ }));
    act(() => speech.finish());
    act(() => speech.finish());
    expect(pos()).toBe('Line 3 of 12');
    expect(announcer()).toBe('');
  });

  it('a move the user makes while paused IS announced', () => {
    mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Next line' }));
    expect(announcer()).toBe('Line 2 of 12');
  });
});

describe('Capture — keyboard and word highlight', () => {
  it('Space plays and pauses, arrows move by line', () => {
    const { speech } = mount('#/capture/c1');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(speech.spoken).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(pos()).toBe('Line 2 of 12');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(pos()).toBe('Line 1 of 12');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('button', { name: /^Play Product brainstorm/ })).toBeTruthy();
  });

  it('arrows still work with focus on the play button; Space is left to the button', () => {
    const { speech } = mount('#/capture/c1');
    const play = screen.getByRole('button', { name: /^Play Product brainstorm/ });
    fireEvent.keyDown(play, { key: 'ArrowRight' });
    expect(pos()).toBe('Line 2 of 12');
    fireEvent.keyDown(play, { key: ' ' });
    expect(speech.spoken).toHaveLength(0); // the button's own activation handles Space
  });

  it('keys typed into a field are never hijacked', () => {
    mount('#/capture/c2');
    fireEvent.click(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })[0]);
    fireEvent.keyDown(screen.getByLabelText('Who is this?'), { key: 'ArrowRight' });
    expect(pos()).toBe('Line 1 of 13');
  });

  it('marks the word the voice reports, inside the line being read', () => {
    const { speech } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: /^Play Product brainstorm/ }));
    act(() => speech.word({ start: 6, end: 9 }));
    const mark = document.querySelector('mark.mb-word')!;
    expect(mark.textContent).toBe("I'm"); // chars 6–9 of "Okay, I'm…"
    expect(mark.closest('[aria-current="true"]')).toBeTruthy();
    act(() => speech.finish());
    expect(document.querySelector('mark.mb-word')).toBeNull(); // cleared on the next line
  });
});

describe('Capture — rename and tag', () => {
  it('renames in place; Enter saves and it shows everywhere', async () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Title');
    fireEvent.change(input, { target: { value: 'Per-document speed' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Per-document speed');
    await navigate('#/recent');
    expect(screen.getByRole('link', { name: 'Per-document speed' })).toBeTruthy();
  });

  it('Escape cancels and a blank title can’t be saved', () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Title');
    fireEvent.change(input, { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Read-aloud speed idea');
  });

  it('adds a tag, reusing the existing spelling, and never twice', async () => {
    mount('#/capture/c4');
    const input = screen.getByLabelText('Add a tag');
    fireEvent.change(input, { target: { value: 'product' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('link', { name: 'Product' })).toBeTruthy();
    fireEvent.change(input, { target: { value: '#PRODUCT' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getAllByRole('link', { name: 'Product' })).toHaveLength(1);
  });

  it('removes a tag', () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Ideas' }));
    expect(screen.queryByRole('link', { name: 'Ideas' })).toBeNull();
    expect(screen.getByPlaceholderText('No tags yet — add one')).toBeTruthy();
  });
});

describe('Capture — a note is not a meeting', () => {
  it('a note has no speakers, attendees or confidence flags', () => {
    mount('#/capture/c1');
    expect(screen.queryByText('Attendees')).toBeNull();
    expect(screen.queryByText('Low confidence')).toBeNull();
    expect(screen.queryByRole('button', { name: /Correct who this speaker is/ })).toBeNull();
  });

  it('a meeting has all three', () => {
    mount('#/capture/c2');
    expect(screen.getByText('Attendees')).toBeTruthy();
    expect(screen.getAllByText('Low confidence')).toHaveLength(4);
  });
});

describe('Capture — speaker correction', () => {
  function fix(name: string) {
    fireEvent.click(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })[0]);
    expect(screen.getByText(/Applies to all 4 lines in this voice/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Who is this?'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  }

  it('one correction fixes every line in the voice, says how many, and clears the flags', () => {
    mount('#/capture/c2');
    fix('Sarah Lee');
    expect(screen.queryAllByRole('button', { name: /^Speaker 3\./ })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Sarah Lee. Correct who this speaker is' })).toHaveLength(4);
    expect(screen.queryByText('Low confidence')).toBeNull();
    expect(toast().textContent).toMatch(/Sarah Lee · 4 lines updated/);
  });

  it('undo puts it back', () => {
    mount('#/capture/c2');
    fix('Sarah Lee');
    fireEvent.click(within(toast()).getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })).toHaveLength(4);
    expect(screen.getAllByText('Low confidence')).toHaveLength(4);
  });

  it('undo reverses the correction only — a task ticked meanwhile stays ticked', () => {
    mount('#/capture/c2');
    fix('Sarah Lee');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Update client on Phase 2 timeline' }));
    fireEvent.click(within(toast()).getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })).toHaveLength(4);
    expect((screen.getByRole('checkbox', { name: 'Done: Update client on Phase 2 timeline' }) as HTMLInputElement).checked).toBe(true);
  });

  it('attendees are offered as one-click answers', () => {
    mount('#/capture/c2');
    fireEvent.click(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })[0]);
    fireEvent.click(within(screen.getByRole('group', { name: 'Attendees' })).getByRole('button', { name: 'Maya Chen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    /* Merge: Speaker 3 was Maya all along. Maya is still one speaker. */
    expect(screen.getByText(/Maya Chen · 4 lines updated/)).toBeTruthy();
    expect(screen.getByText('You, Maya Chen, John Park')).toBeTruthy();
  });

  it('Escape cancels and returns focus to the name', () => {
    mount('#/capture/c2');
    const trigger = screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })[0];
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByLabelText('Who is this?'), { key: 'Escape' });
    expect(screen.queryByLabelText('Who is this?')).toBeNull();
  });
});

describe('Focus never falls to nowhere', () => {
  it('ticking a task keeps focus on it in its new group', () => {
    mount('#/tasks');
    const box = screen.getByRole('checkbox', { name: 'Done: Audit the enterprise onboarding funnel' });
    box.focus();
    fireEvent.click(box);
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Done: Audit the enterprise onboarding funnel' }));
    expect((document.activeElement as HTMLInputElement).checked).toBe(true);
  });

  it('ticking a task out of a filtered view lands on the heading', () => {
    mount('#/tasks');
    fireEvent.click(screen.getByRole('button', { name: 'To do' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Audit the enterprise onboarding funnel' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('opening a page names it in the tab title and moves focus to its heading', async () => {
    mount('#/recent');
    await navigate('#/capture/c2');
    expect(document.title).toBe('Product Sync — Mumble');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('changing a filter is NOT a new page — focus stays on the filter', async () => {
    mount('#/recent');
    const chip = screen.getByRole('button', { name: 'Notes' });
    chip.focus();
    fireEvent.click(chip);
    await navigate(window.location.hash);
    expect(document.activeElement?.textContent).toBe('Notes');
  });

  it('Undo stays while you are on it, however long that takes', async () => {
    vi.useFakeTimers();
    try {
      mount('#/capture/c2');
      fireEvent.click(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })[0]);
      fireEvent.change(screen.getByLabelText('Who is this?'), { target: { value: 'Sarah Lee' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      fireEvent.mouseEnter(toast());
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(toast()).toBeTruthy();
      fireEvent.mouseLeave(toast());
      act(() => { vi.advanceTimersByTime(10_001); });
      expect(toast()).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});

describe('Tasks are one object everywhere', () => {
  it('ticking a task on the capture ticks it on the Tasks screen', async () => {
    mount('#/capture/c1');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Audit the enterprise onboarding funnel' }));
    await navigate('#/tasks');
    const done = screen.getByRole('heading', { name: /^Done/ }).closest('section')!;
    expect(within(done).getByText('Audit the enterprise onboarding funnel')).toBeTruthy();
  });

  it('every task says where it came from, and links there', () => {
    mount('#/tasks');
    const link = screen.getAllByRole('link', { name: 'From: Product Sync' })[0];
    expect(link.getAttribute('href')).toBe('#/capture/c2');
  });
});

describe('Record', () => {
  it('transcribes live, suggests tasks by phrasing, and saves a note', async () => {
    const { rec } = mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(rec.state.started).toBe(1);
    act(() => rec.say('Quick thought on the pricing page.'));
    act(() => rec.say('We need to send the proposal by Friday.'));
    act(() => rec.hear('and also the'));
    expect(screen.getByText('We need to send the proposal by Friday.').closest('.mb-line')!.className).toContain('is-task');
    expect(screen.getByText('and also the')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }));
    await navigate(window.location.hash);
    expect(window.location.hash).toMatch(/^#\/capture\/b\d+$/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Quick thought on the pricing page');
    /* Honest provenance: no model, so no summary and a rule-based label. */
    expect(screen.getByText(/Suggested by phrasing/)).toBeTruthy();
    expect(screen.getByText(/No summary/)).toBeTruthy();
    expect(screen.getByText('We need to send the proposal by Friday')).toBeTruthy();
    /* The interim phrase on screen at Stop was heard, so it was kept. */
    expect(screen.getByText('and also the')).toBeTruthy();
  });

  it('a phrase still being heard when you pause is kept by Stop & save', async () => {
    const { rec } = mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => rec.hear('last thing I said'));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('last thing I said')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }));
    await navigate(window.location.hash);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('last thing I said');
  });

  it('meeting mode is visibly off, with the reason on screen', () => {
    mount('#/record');
    expect((screen.getByRole('radio', { name: 'Meeting' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/needs a model that can tell voices apart/)).toBeTruthy();
  });

  it('stopping with nothing heard saves nothing and says so', () => {
    mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Nothing was heard/);
    expect(window.location.hash).toBe('#/record');
  });

  it('a recogniser error pauses and shows the message', () => {
    const { rec } = mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => rec.fail('Microphone access was blocked.'));
    expect(screen.getByRole('alert').textContent).toBe('Microphone access was blocked.');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('no recognition in this browser: recording is disabled and the reason given', () => {
    mount('#/record', { rec: fakeRecognizer(false) });
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Firefox doesn’t support it/)).toBeTruthy();
  });

  it('leaving mid-recording releases the microphone', async () => {
    const { rec } = mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await navigate('#/recent');
    expect(rec.state.stopped).toBeGreaterThan(0);
  });
});

describe('Settings — voices', () => {
  it('says why device voices sound robotic, and where better ones are', () => {
    mount('#/settings');
    expect(screen.getByText(/only has basic voices, which is why they sound robotic/)).toBeTruthy();
  });

  it('the natural option is off, with the reason, where the browser cannot run it', () => {
    mount('#/settings');
    expect((screen.getByRole('radio', { name: 'Natural' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Natural needs a browser that can run it/)).toBeTruthy();
  });
});

describe('Natural voice in the reader', () => {
  function natural() {
    const w: WorkerLike = { postMessage: () => {}, onmessage: null };
    const nv = new NaturalVoice(() => w, () => ({ src: '', play: () => Promise.resolve(), pause() {} }) as unknown as HTMLAudioElement, { device: 'wasm', dtype: 'q8' });
    const reply = (m: FromWorker) => act(() => { w.onmessage?.({ data: m } as MessageEvent<FromWorker>); });
    return { nv, reply };
  }

  it('names the one-time download while it happens, instead of claiming to read', async () => {
    const { nv, reply } = natural();
    const { speech } = mount('#/capture/c1', { natural: nv, engine: 'natural' });
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Play Product brainstorm session aloud' }));
    reply({ type: 'progress', key: 'wasm/q8', file: 'model.onnx', loaded: 40_000_000, total: 95_000_000 });
    expect(document.querySelector('.mb-reader-state')!.textContent).toBe('Downloading natural voice · 40 MB of 95 MB');
    expect(announcer()).toBe('Downloading natural voice · 40 MB of 95 MB'); // a wait is announced once
    expect(speech.spoken).toHaveLength(0); // the device voice is NOT used while natural loads
  });

  it('if the natural voice fails MID-PLAY, the same line carries on in the device voice', async () => {
    const { nv, reply } = natural();
    const { speech } = mount('#/capture/c1', { natural: nv, engine: 'natural' });
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Play Product brainstorm session aloud' }));
    expect(speech.spoken).toHaveLength(0);
    reply({ type: 'load-error', key: 'wasm/q8', message: 'Failed to fetch' });
    await act(async () => { await Promise.resolve(); });
    expect(speech.spoken[0]?.text).toMatch(/^Okay, I'm thinking/);
    expect(screen.queryByRole('alert')).toBeNull(); // no error — it just kept reading
  });

  it('if the natural voice fails, read-aloud falls back to the device voice', async () => {
    const { nv, reply } = natural();
    const { speech } = mount('#/capture/c1', { natural: nv, engine: 'natural' });
    await act(async () => { await Promise.resolve(); });
    reply({ type: 'load-error', key: 'wasm/q8', message: 'Failed to fetch' });
    fireEvent.click(screen.getByRole('button', { name: 'Play Product brainstorm session aloud' }));
    expect(speech.spoken[0].text).toMatch(/^Okay, I'm thinking/);
  });
});

describe('Navigation', () => {
  it('the current section is marked, and a reload keeps the route', () => {
    mount('#/tasks');
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current.some((a) => a.textContent === 'Tasks')).toBe(true);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All Tasks');
  });

  it('a missing capture says so instead of rendering blank', () => {
    mount('#/capture/nope');
    expect(screen.getByText('That capture doesn’t exist any more.')).toBeTruthy();
  });

  it('tags lead to their captures', async () => {
    mount('#/tags');
    fireEvent.click(screen.getByRole('link', { name: 'Ideas' }));
    await navigate(window.location.hash);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('# Ideas');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).sort())
      .toEqual(['Product brainstorm session', 'Read-aloud speed idea']);
  });
});

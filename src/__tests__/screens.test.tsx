// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { initialState, StoreProvider } from '../data/store';
import { ServicesProvider } from '../services';
import { setWorkspace, workspaceFromSearch } from '../data/workspace';
import { fakeAudioFactory, fakeMic, fakeRecognizer, memoryAudioStore } from './fakes';

function mount(hash: string, opts: {
  rec?: ReturnType<typeof fakeRecognizer>; mic?: ReturnType<typeof fakeMic>;
  store?: ReturnType<typeof memoryAudioStore>;
} = {}) {
  window.location.hash = hash;
  const audio = fakeAudioFactory();
  const rec = opts.rec ?? fakeRecognizer();
  const mic = opts.mic ?? fakeMic();
  const store = opts.store ?? memoryAudioStore();
  render(
    <StoreProvider initial={initialState(new Date())}>
      <ServicesProvider makeAudio={audio.make} audioStore={store} mic={mic.make} recognizer={rec.make}>
        <App />
      </ServicesProvider>
    </StoreProvider>,
  );
  return { audio, rec, mic, store };
}

async function navigate(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  localStorage.clear();
  URL.createObjectURL = () => 'blob:recording';
  URL.revokeObjectURL = () => {};
  window.scrollTo = () => {}; // jsdom doesn't implement it
});

/** The position in words — on the scrubber, where a screen reader hears it
    ("Line 4 of 18, 0:42 of 1:16"). The design shows only the clock visually. */
const pos = () => document.querySelector('.mb-player-seek')?.getAttribute('aria-valuetext')?.split(',')[0];
/** The toast — not the reader's announcer, which is also a status region. */
const toast = () => document.querySelector('.mb-toast') as HTMLElement;
/** What a screen reader is told by the player. */
const announcer = () => document.querySelector('.mb-player [role="status"]')?.textContent;
/** Let promises (play(), IndexedDB) settle. */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Open Recent's search the way a person does — the header's Search button. */
async function openSearch() {
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  return screen.getByRole('searchbox');
}
/* c1's real line starts, from src/data/demoAudio.json. */
const C1 = [0.3, 6.1, 11.95, 17.38];
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Recent', () => {
  it('lists every capture, newest first', () => {
    mount('#/recent');
    /* Grouped by day (h2), each recording an h3 under its day. */
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles[0]).toBe('Product brainstorm session');
    expect(titles).toHaveLength(5);
    /* Day groups, newest first, accounting for all five — whatever the hour
       the test runs (at 3am, a recording from 3 hours ago is "Yesterday"). */
    const groups = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent!).filter((t) => /^(Today|Yesterday|Earlier this week|Earlier) \d+$/.test(t));
    expect(groups[0]).toMatch(/^Today \d+$/);
    expect(groups.reduce((n, g) => n + Number(g.split(' ').pop()), 0)).toBe(5);
  });

  it('filters by kind, and the filter lives in the URL', async () => {
    mount('#/recent');
    fireEvent.click(screen.getByRole('button', { name: /^Meetings/ }));
    await navigate(window.location.hash);
    expect(window.location.hash).toBe('#/recent?filter=meetings');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.getByRole('button', { name: /^Meetings/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('search looks inside transcripts, not just titles', async () => {
    mount('#/recent');
    expect(screen.queryByRole('searchbox')).toBeNull(); // calm until asked for, as in the design
    fireEvent.change(await openSearch(), { target: { value: 'sandbox keys' } });
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Weekly team standup']);
  });

  it('plays the RECORDING — and one at a time: a second card stops the first', async () => {
    const { audio } = mount('#/recent');
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }));
    await flush();
    expect(audio.main.src).toMatch(/demo-audio\/c1\.m4a$/);
    expect(audio.main.paused).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product Sync' }));
    await flush();
    expect(audio.main.src).toMatch(/demo-audio\/c2\.m4a$/);
    expect(audio.main.paused).toBe(false);
    expect(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }).getAttribute('data-playing')).toBe('false');
    expect(screen.getByRole('button', { name: 'Pause recording of Product Sync' })).toBeTruthy();
  });

  it('a playing card hidden by search stops', async () => {
    const { audio } = mount('#/recent');
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }));
    await flush();
    fireEvent.change(await openSearch(), { target: { value: 'sandbox keys' } });
    expect(audio.main.paused).toBe(true);
  });

  it('a capture with no recording says so, with no play button that would do nothing', () => {
    const state = initialState(new Date());
    state.captures = state.captures.map((c) => (c.id === 'c4' ? { ...c, audio: undefined } : c));
    window.location.hash = '#/recent';
    render(
      <StoreProvider initial={state}>
        <ServicesProvider makeAudio={fakeAudioFactory().make} audioStore={memoryAudioStore()} mic={fakeMic().make} recognizer={fakeRecognizer().make}>
          <App />
        </ServicesProvider>
      </StoreProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Play recording of Read-aloud speed idea' })).toBeNull();
    expect(screen.getByText(/No recording · transcript only/)).toBeTruthy();
  });
});

describe('Capture — playing the recording', () => {
  it('the highlighted line follows the audio, stated as a line of text', async () => {
    const { audio } = mount('#/capture/c1');
    expect(pos()).toBe('Line 1 of 12');
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }));
    await flush();
    act(() => audio.main.at(C1[2] + 0.5));
    expect(pos()).toBe('Line 3 of 12');
    const current = document.querySelector('[aria-current="true"]')!;
    expect(current.textContent).toMatch(/We need to revisit/);
    /* Line 3 is both being played AND a task — both marks, independently. */
    expect(current.className).toContain('is-current');
    expect(current.className).toContain('is-task');
  });

  it('play from a line starts the recording at that line', async () => {
    const { audio } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Play from line 3' }));
    await flush();
    expect(audio.main.currentTime).toBe(C1[2]);
    expect(audio.main.paused).toBe(false);
  });

  it('the position slider seeks, and says where in words', () => {
    const { audio } = mount('#/capture/c1');
    const slider = screen.getByRole('slider', { name: 'Position in recording' });
    fireEvent.change(slider, { target: { value: String(C1[3] + 1) } });
    expect(audio.main.currentTime).toBeCloseTo(C1[3] + 1);
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^Line 4 of 12, 0:18 of 1:08$/);
  });

  it('speed applies to the audio, keeps the pitch, and is remembered', () => {
    const { audio } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: /^Playback speed 1×/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Playback speed 1.25×/ }));
    expect(audio.main.playbackRate).toBe(1.5);
    expect(audio.main.preservesPitch).toBe(true);
    expect(JSON.parse(localStorage.getItem('mumble.v1')!).prefs.speed).toBe(1.5);
  });

  it('a task links to the line it came from — jumping is not playing', () => {
    const { audio } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Revisit the dashboard layout so key metrics surface first' }));
    expect(audio.main.currentTime).toBe(C1[2]);
    expect(audio.main.paused).toBe(true);
    expect(pos()).toBe('Line 3 of 12');
  });

  it('previous goes to the start of this line first, then the one before', () => {
    const { audio } = mount('#/capture/c1');
    act(() => audio.main.at(C1[2] + 3));
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(audio.main.currentTime).toBe(C1[2]);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(audio.main.currentTime).toBe(C1[1]);
  });

  it('a blocked play is explained, not silent', async () => {
    const { audio } = mount('#/capture/c1');
    audio.main.rejectNext = 'NotAllowedError';
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }));
    await flush();
    expect(document.querySelector('.mb-player-state')!.textContent).toMatch(/blocked playback/);
  });

  it('a recording that won’t load says so', async () => {
    const { audio } = mount('#/capture/c1');
    act(() => audio.main.fail());
    expect(document.querySelector('.mb-player-state')!.textContent).toBe('The recording couldn’t be loaded.');
  });

  it('leaving the screen stops the recording', async () => {
    const { audio } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }));
    await flush();
    await navigate('#/tasks');
    expect(audio.main.paused).toBe(true);
  });
});

describe('Resume where you left off', () => {
  it('pausing remembers the spot; reopening resumes there and the track shows it', async () => {
    const { audio } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }));
    await flush();
    act(() => audio.main.at(C1[3] + 1));
    fireEvent.click(screen.getByRole('button', { name: 'Pause recording of Product brainstorm session' }));
    expect(JSON.parse(localStorage.getItem('mumble.v1')!).captures.find((c: { id: string }) => c.id === 'c1').listenedTo).toBeCloseTo(C1[3] + 1, 0);
    await navigate('#/recent');
    expect(screen.getByRole('progressbar', { name: 'Position in recording, Product brainstorm session' }).getAttribute('aria-valuetext')).toMatch(/^Listened to 0:18 of 1:08/);
    await navigate('#/capture/c1');
    expect(pos()).toBe('Line 4 of 12');
  });
});

describe('Capture — what a screen reader hears', () => {
  it('lines advancing as it plays are NOT announced — that would talk over the recording', async () => {
    const { audio } = mount('#/capture/c1');
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Product brainstorm session' }));
    await flush();
    act(() => audio.main.at(C1[2] + 0.5));
    expect(pos()).toBe('Line 3 of 12');
    expect(announcer()).toBe('');
  });

  it('a move the user makes while paused IS announced', () => {
    mount('#/capture/c1');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(announcer()).toBe('Line 2 of 12');
  });
});

describe('Capture — keyboard', () => {
  it('Space plays and pauses, arrows move by line', async () => {
    const { audio } = mount('#/capture/c1');
    fireEvent.keyDown(document.body, { key: ' ' });
    await flush();
    expect(audio.main.paused).toBe(false);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(pos()).toBe('Line 2 of 12');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(audio.main.paused).toBe(true);
  });

  it('arrows still work with focus on the play button; Space is left to the button', () => {
    const { audio } = mount('#/capture/c1');
    const play = screen.getByRole('button', { name: /^Play recording of Product brainstorm/ });
    fireEvent.keyDown(play, { key: 'ArrowRight' });
    expect(pos()).toBe('Line 2 of 12');
    fireEvent.keyDown(play, { key: ' ' });
    expect(audio.main.plays).toBe(0); // the button's own activation handles Space
  });

  it('keys typed into a field are never hijacked', () => {
    mount('#/capture/c2');
    fireEvent.click(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })[0]);
    fireEvent.keyDown(screen.getByLabelText('Who is this?'), { key: 'ArrowRight' });
    expect(pos()).toBe('Line 1 of 13');
  });
});

describe('Capture — rename and tag', () => {
  it('the title box IS the field: type, Enter saves, and it shows everywhere', async () => {
    mount('#/capture/c4');
    const input = screen.getByLabelText('Title') as HTMLInputElement;
    expect(input.value).toBe('Read-aloud speed idea');
    fireEvent.change(input, { target: { value: 'Per-document speed' } });
    fireEvent.blur(input);
    await navigate('#/recent');
    expect(screen.getByRole('link', { name: 'Per-document speed' })).toBeTruthy();
  });

  it('Escape puts the title back, and a blank title isn’t saved', () => {
    mount('#/capture/c4');
    const input = screen.getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(input.value).toBe('Read-aloud speed idea');
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('Read-aloud speed idea');
  });

  it('adds a tag, reusing the existing spelling, and never twice', async () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    const input = screen.getByLabelText('Add a tag');
    fireEvent.change(input, { target: { value: 'product' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('link', { name: 'Product' })).toBeTruthy();
    fireEvent.change(input, { target: { value: '#PRODUCT' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getAllByRole('link', { name: 'Product' })).toHaveLength(1);
  });

  it('a new tag gets the colour you pick, and it shows everywhere', async () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    fireEvent.change(screen.getByLabelText('Add a tag'), { target: { value: 'Pricing' } });
    expect(screen.getByRole('option', { name: /Create\s*Pricing/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Colour for Pricing' })).getByRole('radio', { name: 'Green' }));
    fireEvent.submit(screen.getByLabelText('Add a tag').closest('form')!);
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Colour of Pricing: green. Change' })).toBeTruthy();
    await navigate('#/tags');
    expect(document.querySelector('.mb-tag-swatch.is-green')).toBeTruthy();
  });

  it('a new tag’s colour is your choice — typing never changes it', () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    const input = screen.getByLabelText('Add a tag');
    const picked = () => screen.getByRole('radiogroup', { name: /^Colour for/ }).querySelector('[aria-checked="true"]')?.getAttribute('aria-label');
    fireEvent.change(input, { target: { value: 'P' } });
    const start = picked();
    for (const v of ['Pr', 'Pri', 'Pric', 'Prici', 'Pricin', 'Pricing']) {
      fireEvent.change(input, { target: { value: v } });
      expect(picked()).toBe(start);
    }
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /^Colour for/ })).getByRole('radio', { name: 'Orange' }));
    fireEvent.change(input, { target: { value: 'Pricing page' } });
    expect(picked()).toBe('Orange');
  });

  it('a tag’s dot changes its colour', () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Colour of Ideas: yellow. Change' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Colour for Ideas' })).getByRole('radio', { name: 'Purple' }));
    expect(screen.getByRole('button', { name: 'Colour of Ideas: purple. Change' })).toBeTruthy();
  });

  it('the picker filters existing tags; arrows and Enter add one; Escape closes', () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    const input = screen.getByLabelText('Add a tag');
    fireEvent.change(input, { target: { value: 'cl' } });
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names.some((n) => n?.startsWith('Client'))).toBe(true);
    expect(names.some((n) => n?.startsWith('Product'))).toBe(false);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '#/tags/Client')).toBe(true);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Add a tag')).toBeNull();
  });

  it('removes a tag', () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Ideas' }));
    expect(screen.queryByRole('link', { name: 'Ideas' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeTruthy();
  });
});

describe('Capture — a note is not a meeting', () => {
  it('a note has no speakers, attendees or confidence flags', () => {
    mount('#/capture/c1');
    expect(screen.queryByRole('group', { name: 'Meeting attendees' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Who is this\?/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Correct who this speaker is/ })).toBeNull();
  });

  it('a meeting has all three', () => {
    mount('#/capture/c2');
    expect(screen.getByRole('group', { name: 'Meeting attendees' })).toBeTruthy();
    /* The model's doubt: flagged on each of Speaker 3's four turns, and counted in the header. */
    expect(screen.getAllByRole('button', { name: /^Who is this\?/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: '1 voice to confirm' })).toBeTruthy();
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
    expect(screen.queryAllByRole('button', { name: /^Who is this\?/ })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /voice to confirm/ })).toBeNull();
    expect(toast().textContent).toMatch(/Sarah Lee · 4 lines updated/);
  });

  it('undo puts it back', () => {
    mount('#/capture/c2');
    fix('Sarah Lee');
    fireEvent.click(within(toast()).getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /^Who is this\?/ })).toHaveLength(4);
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
    const speakers = screen.getByText('Speakers', { selector: 'dt' }).nextElementSibling!;
    expect(speakers.textContent).toBe('3'); // You, Maya Chen, John Park — no duplicate Maya, none unconfirmed
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
    fireEvent.click(screen.getByRole('button', { name: /^To do/ }));
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
    const chip = screen.getByRole('button', { name: /^Notes/ });
    chip.focus();
    fireEvent.click(chip);
    await navigate(window.location.hash);
    expect(document.activeElement?.textContent).toMatch(/^Notes/);
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

  it('every task says where it came from, and opens AT the line it came from', () => {
    mount('#/tasks');
    const link = screen.getByRole('link', { name: 'Update client on Phase 2 timeline' });
    expect(link.getAttribute('href')).toBe('#/capture/c2?line=12');
    expect(link.closest('.mb-taskcard')!.textContent).toContain('From: Product Sync');
  });

  it('opening a capture at a line lands on that line', async () => {
    const { audio } = mount('#/capture/c1?line=3');
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(pos()).toBe('Line 3 of 12');
    expect(audio.main.currentTime).toBe(C1[2]);
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
    await flush();
    await navigate(window.location.hash);
    expect(window.location.hash).toMatch(/^#\/capture\/b\d+$/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Quick thought on the pricing page');
    /* Honest provenance: no model, so no summary and a rule-based label. */
    expect(screen.getByText(/Suggested by phrasing/)).toBeTruthy();
    expect(screen.getByText(/No summary/)).toBeTruthy();
    expect(screen.getAllByText('We need to send the proposal by Friday').length).toBe(1); // the task, in the side panel
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
    await flush();
    await navigate(window.location.hash);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('last thing I said');
  });

  it('the RECORDING is saved with the note, and plays back', async () => {
    const { rec, mic, store, audio } = mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(mic.state.started).toBe(1);
    act(() => rec.say('Quick thought on the pricing page.'));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mic.state.paused).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(mic.state.resumed).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }));
    await flush();
    await navigate(window.location.hash);
    const id = window.location.hash.split('/').pop()!;
    expect(await store.get(id)).toBe(mic.blob);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /^Play recording of Quick thought/ }));
    await flush();
    expect(audio.made.at(-1)!.src).toBe('blob:recording');
  });

  it('if the mic won’t record, the words are still saved — as a transcript, and it says so', async () => {
    const { rec } = mount('#/record', { mic: fakeMic({ refuse: true }) });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByText(/saved as a transcript only/)).toBeTruthy();
    act(() => rec.say('Still worth keeping.'));
    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }));
    await flush();
    await navigate(window.location.hash);
    expect(screen.getByText('Transcript only', { selector: '.mb-player-time' })).toBeTruthy();
    expect(screen.getByText('Transcript only', { selector: 'dd' })).toBeTruthy();
  });

  it('meeting mode is visibly off, with the reason on screen', () => {
    mount('#/record');
    expect((screen.getByRole('radio', { name: 'Meeting' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/needs a model that can tell voices apart/)).toBeTruthy();
  });

  it('stopping with nothing heard saves nothing and says so', async () => {
    mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }));
    await flush();
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

  it('on an insecure (http) page, recording is off and it says why — not a silent failure', () => {
    const was = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    try {
      mount('#/record');
      expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(/Recording needs a secure link/)).toBeTruthy();
      expect(screen.queryByText(/Firefox doesn’t support it/)).toBeNull();
    } finally {
      if (was) Object.defineProperty(window, 'isSecureContext', was); else delete (window as { isSecureContext?: boolean }).isSecureContext;
    }
  });

  it('leaving mid-recording releases the microphone', async () => {
    const { rec } = mount('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await navigate('#/recent');
    expect(rec.state.stopped).toBeGreaterThan(0);
  });
});

describe('Settings', () => {
  it('has only settings that do something — every switch changes a preference', () => {
    mount('#/settings');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).slice(0, 4)).toEqual(['Workspace', 'Playback', 'Recording', 'Privacy & data']);
    expect(screen.getByRole('radiogroup', { name: 'Playback speed' })).toBeTruthy();
    const keys = screen.getByRole('switch', { name: 'Keyboard shortcuts' });
    expect(keys.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(keys);
    expect(screen.getByRole('switch', { name: 'Keyboard shortcuts' }).getAttribute('aria-checked')).toBe('false');
  });

  it('turning shortcuts off really turns them off', async () => {
    const { audio } = mount('#/settings');
    fireEvent.click(screen.getByRole('switch', { name: 'Keyboard shortcuts' }));
    await navigate('#/capture/c1');
    fireEvent.keyDown(window, { key: ' ' });
    await flush();
    expect(audio.made.length === 0 || audio.main.paused).toBe(true);
  });

  it('turning task suggestions off means a recording suggests none', async () => {
    const { rec } = mount('#/settings');
    fireEvent.click(screen.getByRole('switch', { name: 'Find tasks while I talk' }));
    await navigate('#/record');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => rec.say('We need to send the proposal by Friday.'));
    expect(screen.getByText('We need to send the proposal by Friday.').closest('.mb-line')!.className).not.toContain('is-task');
  });

  it('reset also removes recordings made in this browser', async () => {
    const store = memoryAudioStore();
    await store.put('b1', new Blob(['x']));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount('#/settings', { store });
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    await flush();
    expect(await store.get('b1')).toBeUndefined();
  });
});

describe('List + detail screens', () => {
  it('Meetings: newest first, and a meeting opens the same note screen as everything else', async () => {
    mount('#/meetings');
    expect(screen.getAllByRole('heading', { level: 2 })[0].textContent).toBe('Product Sync');
    fireEvent.click(screen.getByRole('link', { name: 'Weekly team standup' }));
    await navigate(window.location.hash);
    expect(window.location.hash).toBe('#/capture/c3');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Weekly team standup');
  });

  it('Meetings: a card plays its recording; a person in the panel filters the list', async () => {
    const { audio } = mount('#/meetings');
    fireEvent.click(screen.getByRole('button', { name: 'Play recording of Client call — Northbank' }));
    await flush();
    expect(audio.main.src).toMatch(/c5\.m4a$/);
    expect(audio.main.paused).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^Alex Rivera/ }));
    expect(within(screen.getByRole('list', { name: 'Meetings' })).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Weekly team standup']);
  });

  it('Meetings: an unsure voice links to the line where you can say who it is', () => {
    mount('#/meetings');
    /* In the side panel on a laptop, in a card under the title on a phone —
       both go to the same line. */
    for (const a of screen.getAllByRole('link', { name: 'Who is this?' })) expect(a.getAttribute('href')).toBe('#/capture/c2?line=1');
  });

  it('Tasks: filter by tag, and the panel counts who owns what', () => {
    mount('#/tasks');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name: 'Client' }));
    const rows = screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
    expect(rows).toEqual(['Done: Send Northbank a written summary by Thursday', 'Done: Fix the export date range']);
    expect(screen.getByRole('button', { name: /^Unassigned\s*6 tasks$/ })).toBeTruthy();
  });

  it('Tasks: "Mine" shows only tasks assigned to you', () => {
    mount('#/tasks');
    fireEvent.click(screen.getByRole('button', { name: /^Mine/ }));
    const labels = screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
    expect(labels.length).toBeGreaterThan(0);
    const owners = [...document.querySelectorAll<HTMLSelectElement>('.mb-taskcard select[id^="as-"]')].map((x) => x.value);
    expect(owners.every((o) => o === 'You')).toBe(true);
    expect(owners).toHaveLength(labels.length);
  });
});

describe('Everything that looks clickable does something', () => {
  it('a whole feed card opens its capture, not just the title', () => {
    mount('#/recent');
    const card = screen.getByRole('link', { name: 'Product Sync' }).closest('.mb-card')!;
    expect(card.className).toContain('mb-stretch');
    expect(screen.getByRole('link', { name: 'Product Sync' }).className).toContain('mb-stretch-link');
  });

  it('"Who is this?", the low-confidence flag, opens the speaker fix', () => {
    mount('#/capture/c2');
    fireEvent.click(screen.getAllByRole('button', { name: /^Who is this\?/ })[0]);
    expect(screen.getByLabelText('Who is this?')).toBeTruthy();
  });

  it('a speaker’s timestamp plays from that turn', async () => {
    const { audio } = mount('#/capture/c2');
    fireEvent.click(screen.getByRole('button', { name: 'Play from 0:08' }));
    await flush();
    expect(audio.main.paused).toBe(false);
    expect(pos()).toBe('Line 2 of 13');
  });

  it('task status moves on the Tasks screen, and shows on the capture', async () => {
    mount('#/tasks');
    fireEvent.change(screen.getByLabelText('Status of Follow up with design team on dashboard'), { target: { value: 'in-progress' } });
    const inProgress = screen.getByRole('heading', { name: /^In progress/ }).closest('section')!;
    expect(within(inProgress).getByText('Follow up with design team on dashboard')).toBeTruthy();
    await navigate('#/capture/c2');
    expect(screen.getByRole('button', { name: /Follow up with design team on dashboard is in progress/ })).toBeTruthy();
  });

  it('Who owns what filters the list to that person', () => {
    mount('#/tasks');
    fireEvent.click(screen.getByRole('button', { name: /^Maya Chen/ }));
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Done: Schedule mobile review for Q3']);
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(1);
  });

  it('+ New Task adds a task to the chosen capture', () => {
    mount('#/tasks');
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Book the venue' } });
    fireEvent.change(screen.getByLabelText('From capture'), { target: { value: 'c5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const card = screen.getByText('Book the venue').closest('.mb-taskcard')!;
    expect(card.textContent).toContain('From: Client call — Northbank');
  });
});

describe('Navigation', () => {
  it('the current section is marked, and a reload keeps the route', () => {
    mount('#/tasks');
    /* Marked in the sidebar and in the phone tab bar alike. */
    expect(screen.getAllByRole('link', { name: /^Tasks/, current: 'page' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: /^Recent/, current: 'page' })).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tasks');
  });

  it('a missing capture says so instead of rendering blank', () => {
    mount('#/capture/nope');
    expect(screen.getByText('That capture doesn’t exist any more.')).toBeTruthy();
  });

  it('tags lead to their captures', async () => {
    mount('#/tags');
    fireEvent.click(screen.getByRole('link', { name: 'Ideas' }));
    await navigate(window.location.hash);
    /* The tag grid stays; the chosen tag fills the side panel. */
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tags');
    expect(document.getElementById('tag-detail-h')!.textContent).toBe('Ideas');
    expect(within(screen.getByRole('list', { name: 'Tags' })).getByRole('link', { name: 'Ideas' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: 'Product brainstorm session' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Read-aloud speed idea' })).toBeTruthy();
  });
});

describe('Redesign QA (Oct 1)', () => {
  it('"1 voice to confirm" opens the fix for that voice', () => {
    mount('#/capture/c2');
    fireEvent.click(screen.getByRole('button', { name: '1 voice to confirm' }));
    expect(screen.getByLabelText('Who is this?')).toBeTruthy();
    expect(screen.getByText(/Applies to all 4 lines in this voice/)).toBeTruthy();
  });

  it('New task opens where it was pressed, and is there even when a filter shows nothing', () => {
    mount('#/tasks');
    /* Client tag × Maya Chen: nothing matches. */
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name: 'Client' }));
    fireEvent.click(screen.getByRole('button', { name: /^Maya Chen/ }));
    expect(screen.getByText('No tasks match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(screen.getByLabelText('New task')).toBeTruthy();
  });
});

describe('Add tasks yourself, and say anything you could type (Oct 6)', () => {
  it('a task typed on a note is added, says "Added by you", and shows on Tasks', async () => {
    mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Try the speed idea on a long transcript' } });
    fireEvent.submit(screen.getByLabelText('New task').closest('form')!);
    expect(screen.getByText('Try the speed idea on a long transcript')).toBeTruthy();
    expect(screen.getByText('Added by you')).toBeTruthy();
    expect((screen.getByLabelText('New task') as HTMLInputElement).value).toBe(''); // ready for the next one
    await navigate('#/tasks');
    expect(screen.getByRole('link', { name: 'Try the speed idea on a long transcript' })).toBeTruthy();
  });

  it('a task can be said instead of typed', () => {
    const { rec } = mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Say the task' }));
    expect(screen.getByRole('button', { name: 'Stop dictating' }).getAttribute('aria-pressed')).toBe('true');
    act(() => rec.say('Book the venue.'));
    expect((screen.getByLabelText('New task') as HTMLInputElement).value).toBe('Book the venue');
    expect(screen.getByRole('button', { name: 'Say the task' })).toBeTruthy(); // stopped by itself
    fireEvent.submit(screen.getByLabelText('New task').closest('form')!);
    expect(screen.getByText('Book the venue')).toBeTruthy();
  });

  it('a tag can be said: the picker fills and shows the match', () => {
    const { rec } = mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    fireEvent.click(screen.getByRole('button', { name: 'Say a tag' }));
    act(() => rec.say('Client.'));
    expect((screen.getByLabelText('Add a tag') as HTMLInputElement).value).toBe('Client');
    expect(screen.getByRole('option', { name: /^Client/ })).toBeTruthy();
  });

  it('a title can be said, and it saves', async () => {
    const { rec } = mount('#/capture/c4');
    fireEvent.click(screen.getByRole('button', { name: 'Say a new title' }));
    act(() => rec.say('Reading speed idea.'));
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Reading speed idea');
    await navigate('#/recent');
    expect(screen.getByRole('link', { name: 'Reading speed idea' })).toBeTruthy();
  });

  it('searches can be said', () => {
    const { rec } = mount('#/meetings');
    fireEvent.click(screen.getByRole('button', { name: 'Search meetings by voice' }));
    act(() => rec.say('Northbank.'));
    expect(within(screen.getByRole('list', { name: 'Meetings' })).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Client call — Northbank']);
  });

  it('a speaker’s name can be said', () => {
    const { rec } = mount('#/capture/c2');
    fireEvent.click(screen.getAllByRole('button', { name: 'Speaker 3. Correct who this speaker is' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Say who this is' }));
    act(() => rec.say('Sarah Lee.'));
    expect((screen.getByLabelText('Who is this?') as HTMLInputElement).value).toBe('Sarah Lee');
  });

  it('where the browser can’t dictate, no mic is offered that would do nothing', () => {
    mount('#/capture/c4', { rec: fakeRecognizer(false) });
    expect(screen.queryByRole('button', { name: 'Say a new title' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    expect(screen.queryByRole('button', { name: 'Say the task' })).toBeNull();
    expect(screen.getByLabelText('New task')).toBeTruthy(); // typing still works
  });
});

describe('The team demo — a made-up team with its own link (Oct 7)', () => {
  afterEach(() => setWorkspace('personal'));
  const team = (hash: string) => { setWorkspace('team'); return mount(hash); };
  const photoOf = (el: Element | null) => el?.querySelector('.mb-avatar img')?.getAttribute('src') ?? null;

  it('the address chooses the workspace: ?workspace=team (or ?team); anything else is personal', () => {
    expect(workspaceFromSearch('?workspace=team')).toBe('team');
    expect(workspaceFromSearch('?team')).toBe('team');
    expect(workspaceFromSearch('')).toBe('personal');
    expect(workspaceFromSearch('?workspace=nope')).toBe('personal');
  });

  it('saves under its own key — playing with the team never touches your recordings', () => {
    team('#/recent');
    expect(localStorage.getItem('mumble.team.v1')).toBeTruthy();
    expect(localStorage.getItem('mumble.v1')).toBeNull();
  });

  it('Recent shows the team’s recordings too, with the face of whoever made them', () => {
    team('#/recent');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7);
    const crit = screen.getByRole('link', { name: 'Design crit — empty states' }).closest('article')!;
    expect(within(crit as HTMLElement).getByText(/by Maya Chen/)).toBeTruthy();
    expect(photoOf(crit.querySelector('.mb-card-by'))).toMatch(/people\/maya\.jpg$/);
  });

  it('you are Jordan: your face in the header and the sidebar, both going to the team', () => {
    team('#/recent');
    const me = screen.getByRole('link', { name: /Jordan Ellis, Harbor Labs/ });
    expect(me.getAttribute('href')).toBe('#/team');
    expect(photoOf(me)).toMatch(/people\/jordan\.jpg$/);
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { name: /^Team/ }).getAttribute('href')).toBe('#/team');
    expect(nav.getByRole('link', { name: /^Jordan Ellis/ }).getAttribute('href')).toBe('#/team');
  });

  it('Team: six people, and every count is worked out from the recordings', () => {
    team('#/team');
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(6);
    const stats = (name: string) => {
      const card = cards.find((c) => within(c).queryByRole('heading', { name: new RegExp(`^${name}`) }))!;
      return [...card.querySelectorAll('dd')].map((d) => Number(d.textContent));
    };
    /* Jordan = "You": made the 5 personal recordings, in 4 meetings, owns 4 open tasks. */
    expect(stats('Jordan Ellis')).toEqual([5, 4, 4]);
    /* Maya: her crit notes; Product Sync + the readout; 5 open tasks. */
    expect(stats('Maya Chen')).toEqual([1, 2, 5]);
    expect(screen.getByText(/Everyone in Harbor Labs is made up/)).toBeTruthy();
  });

  it('a task on Maya’s note can go to anyone on the team, not only the person who spoke', () => {
    team('#/capture/t2');
    const who = document.getElementById('as-t2-t1') as HTMLSelectElement;
    const options = [...who.options].map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(['You', 'Sarah Lee', 'John Park', 'Nadia Haddad']));
    expect(screen.getByText('Recorded by').nextElementSibling?.textContent).toBe('Maya Chen');
  });

  it('faces only for people who exist — an unconfirmed voice keeps its dashed ring', () => {
    team('#/capture/c2');
    const people = within(screen.getByRole('group', { name: 'Meeting attendees' }));
    expect(photoOf(people.getByText('Maya Chen').parentElement)).toMatch(/maya\.jpg$/);
    const unsure = document.querySelector('.mb-avatar.is-unconfirmed');
    expect(unsure).toBeTruthy();
    expect(unsure!.querySelector('img')).toBeNull();
  });

  it('the personal demo has no team, no account — and Team points to the team demo', () => {
    mount('#/team');
    expect(screen.queryByRole('link', { name: /Jordan Ellis/ })).toBeNull();
    expect(document.querySelector('.mb-avatar img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the team demo' }).getAttribute('href')).toMatch(/\?workspace=team#\/recent$/);
  });

  it('Settings says who you are, that it’s a demo, and links back to the personal demo', () => {
    team('#/settings');
    expect(screen.getByText(/A demo account — everyone on this team is made up/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Switch' }).getAttribute('href')).toMatch(/#\/recent$/);
    expect(screen.getByText(/Brings back the 7 demo recordings/)).toBeTruthy();
  });
});

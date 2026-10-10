// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { enableWelcome } from '../components/Welcome/welcomeState';
import { initialState, StoreProvider } from '../data/store';
import { setWorkspace } from '../data/workspace';
import { ServicesProvider } from '../services';
import { fakeAudioFactory, fakeDiarizer, fakeMic, fakeRecognizer, memoryAudioStore } from './fakes';

function mount(hash = '#/recent') {
  window.location.hash = hash;
  return render(
    <StoreProvider initial={initialState(new Date())}>
      <ServicesProvider makeAudio={fakeAudioFactory().make} audioStore={memoryAudioStore()} mic={fakeMic().make}
        recognizer={fakeRecognizer().make} diarizer={fakeDiarizer({ available: false }).make}>
        <App />
      </ServicesProvider>
    </StoreProvider>,
  );
}
const card = () => screen.queryByRole('dialog', { name: /welcome to mumble/i });

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = () => {};
  enableWelcome(true);
});
afterEach(async () => {
  const { endTour } = await import('../components/Tour/tourState');
  act(() => endTour());
  cleanup();
  enableWelcome(false);
  setWorkspace('personal');
  delete (window as { mumbleDesktop?: unknown }).mumbleDesktop;
});

describe('the welcome card', () => {
  it('greets a first visit with four things to try, each a link to where it happens', () => {
    mount();
    const c = card()!;
    expect(c).toBeTruthy();
    expect(c.getAttribute('aria-modal')).toBe('true');
    const steps = within(c).getAllByRole('link').filter((a) => a.closest('ol'));
    expect(steps.map((a) => a.textContent)).toEqual([
      expect.stringContaining('Listen to a meeting'), expect.stringContaining('Name a voice'),
      expect.stringContaining('Record something'), expect.stringContaining('See every task'),
    ]);
    expect(steps.map((a) => a.getAttribute('href'))).toEqual(['#/capture/c2', '#/capture/c2?line=9', '#/record', '#/tasks']);
    expect(within(c).getByRole('link', { name: 'Tommy Claffey' }).getAttribute('href')).toBe('https://www.tommyclaffey.com');
    expect(c.textContent).toContain('Designed and engineered by Tommy Claffey');
  });

  it('shows once: closed, it stays closed on the next visit', () => {
    mount();
    fireEvent.click(within(card()!).getByRole('button', { name: 'Start exploring' }));
    expect(card()).toBeNull();
    cleanup();
    mount();
    expect(card()).toBeNull();
  });

  it('closes when a step is chosen, and with Esc', () => {
    mount();
    fireEvent.click(within(card()!).getByRole('link', { name: /record something/i }));
    expect(card()).toBeNull();
    cleanup(); localStorage.clear();
    mount();
    fireEvent.keyDown(card()!, { key: 'Escape' });
    expect(card()).toBeNull();
  });

  it('keeps Tab inside the card', () => {
    mount();
    const c = card()!;
    const start = within(c).getByRole('button', { name: 'Take the tour' });
    start.focus();
    fireEvent.keyDown(c, { key: 'Tab' });
    expect(document.activeElement?.textContent).toContain('Listen to a meeting');
    fireEvent.keyDown(c, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(start);
  });

  it('comes back from Settings', async () => {
    localStorage.setItem('mumble.welcome.v1.personal', '1');
    mount('#/settings');
    expect(card()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the welcome tour' }));
    expect(card()).toBeTruthy();
  });

  it('in the team demo, says who you are and offers the team', () => {
    setWorkspace('team');
    mount();
    const c = card()!;
    expect(c.textContent).toContain('You’re Jordan Ellis, Head of Product at Harbor Labs');
    expect(within(c).getByRole('link', { name: /meet the team/i }).getAttribute('href')).toBe('#/team');
  });

  it('never shows inside the Mac app, which is your own Mumble, not a demo', () => {
    (window as { mumbleDesktop?: unknown }).mumbleDesktop = { version: 'test' };
    mount();
    expect(card()).toBeNull();
  });

  it('has no mechanical accessibility failures', async () => {
    mount();
    await act(async () => { await Promise.resolve(); });
    const r = await axe.run(card()!, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('the tour', () => {
  const tourCard = () => screen.queryByRole('dialog', { name: /./ });
  const flushFrames = () => act(async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 20)); });

  it('starts from the welcome card and walks the real screens, Back and Next', async () => {
    mount();
    fireEvent.click(within(card()!).getByRole('button', { name: 'Take the tour' }));
    await flushFrames();
    expect(card()).toBeNull();
    let t = tourCard()!;
    expect(t.textContent).toContain('Step 1 of 8');
    expect(t.textContent).toContain('Every recording, ready to play');
    fireEvent.click(within(t).getByRole('button', { name: 'Next' }));
    await flushFrames();
    t = tourCard()!;
    expect(t.textContent).toContain('Tasks from what people said');
    fireEvent.click(within(t).getByRole('button', { name: 'Next' }));
    await flushFrames();
    expect(window.location.hash).toBe('#/capture/c2');
    expect(tourCard()!.textContent).toContain('Listen and read');
    fireEvent.click(within(tourCard()!).getByRole('button', { name: 'Back' }));
    await flushFrames();
    expect(window.location.hash).toBe('#/recent');
    expect(tourCard()!.textContent).toContain('Step 2 of 8');
  });

  it('arrow keys move, Esc ends it', async () => {
    mount();
    fireEvent.click(within(card()!).getByRole('button', { name: 'Take the tour' }));
    await flushFrames();
    fireEvent.keyDown(tourCard()!, { key: 'ArrowRight' });
    await flushFrames();
    expect(tourCard()!.textContent).toContain('Step 2 of 8');
    fireEvent.keyDown(tourCard()!, { key: 'Escape' });
    await flushFrames();
    expect(tourCard()).toBeNull();
  });

  it('skips a stop whose thing isn’t on screen, and ends on Finish', async () => {
    const { setTourStep } = await import('../components/Tour/tourState');
    mount();
    fireEvent.click(within(card()!).getByRole('button', { name: 'Start exploring' }));
    /* Name Speaker 3 first: the "Name a voice" stop then has nothing to show. */
    act(() => setTourStep(2));
    await flushFrames();
    expect(tourCard()!.textContent).toContain('Listen and read');
    document.querySelectorAll('.mb-speaker-who').forEach((el) => el.classList.remove('mb-speaker-who'));
    fireEvent.click(within(tourCard()!).getByRole('button', { name: 'Next' }));
    /* It looks for the missing thing for ~40 frames before moving on. */
    await waitFor(() => expect(tourCard()?.textContent).toContain('Every task shows its source'), { timeout: 3000 });
    act(() => setTourStep(7));
    await flushFrames();
    expect(tourCard()!.textContent).toContain('That’s the tour');
    fireEvent.click(within(tourCard()!).getByRole('button', { name: 'Finish' }));
    await flushFrames();
    expect(tourCard()).toBeNull();
  });

  it('counts only the stops you’ll get: with Speaker 3 already named, it’s 7', async () => {
    mount('#/capture/c2');
    fireEvent.click(within(card()!).getByRole('button', { name: 'Start exploring' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Who is this\?/ })[0]);
    fireEvent.change(screen.getByLabelText('Who is this?'), { target: { value: 'Sarah Lee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.queryAllByRole('button', { name: /^Who is this\?/ })).toHaveLength(0);
    const { startTour } = await import('../components/Tour/tourState');
    act(() => startTour());
    await flushFrames();
    expect(tourCard()!.textContent).toContain('Step 1 of 7');
  });

  it('the team demo’s tour shows the team', async () => {
    setWorkspace('team');
    mount();
    fireEvent.click(within(card()!).getByRole('button', { name: 'Take the tour' }));
    await flushFrames();
    fireEvent.click(within(tourCard()!).getByRole('button', { name: 'Next' }));
    await flushFrames();
    expect(tourCard()!.textContent).toContain('Your team');
  });

  it('the Demo tag brings back the welcome card', () => {
    localStorage.setItem('mumble.welcome.v1.personal', '1');
    mount();
    expect(card()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /demo: show the welcome card/i }));
    expect(card()).toBeTruthy();
  });

  it('has no mechanical accessibility failures', async () => {
    mount();
    fireEvent.click(within(card()!).getByRole('button', { name: 'Take the tour' }));
    await flushFrames();
    const r = await axe.run(tourCard()!, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

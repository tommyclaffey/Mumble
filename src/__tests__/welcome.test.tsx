// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
afterEach(() => {
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
    const start = within(c).getByRole('button', { name: 'Start exploring' });
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

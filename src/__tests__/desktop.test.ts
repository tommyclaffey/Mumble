import { describe, expect, it } from 'vitest';
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

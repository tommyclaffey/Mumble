import { describe, expect, it } from 'vitest';
import { fitOf, groupVoices, linesToSpeakers, unit } from '../record/diarize';
import { correctSpeaker, type Meeting } from '../data/model';

/* Voiceprints near three directions = three people. */
const A = (n = 0) => unit([1, 0.05 * n, 0]);
const B = (n = 0) => unit([0.05 * n, 1, 0]);
const C = (n = 0) => unit([0, 0.05 * n, 1]);

describe('telling voices apart — the arithmetic', () => {
  it('groups voiceprints into as many people as you said were there', () => {
    const { label, count } = groupVoices([A(), B(), A(1), C(), B(1), C(1)], 3);
    expect(count).toBe(3);
    expect(label[0]).toBe(label[2]);
    expect(label[1]).toBe(label[4]);
    expect(label[3]).toBe(label[5]);
    expect(new Set(label).size).toBe(3);
  });

  it('works out the number itself when you’re not sure', () => {
    expect(groupVoices([A(), B(), A(1), B(1)], null).count).toBe(2);
    expect(groupVoices([A(), A(1), A(2)], null).count).toBe(1);
  });

  it('a voice sitting between two people fits neither well', () => {
    const between = unit([1, 1, 0]);
    const prints = [A(), A(1), A(2), A(3), B(), B(1), B(2), B(3), between];
    const { label, count } = groupVoices(prints, 2);
    const fit = fitOf(prints, label, count);
    expect(fit[0]).toBeGreaterThan(0.9);
    expect(fit[8]).toBeLessThan(0.75);
  });

  it('each line goes to whoever spoke most in it; Speaker 1 is whoever spoke first', () => {
    const spans = [
      { start: 0, end: 4, who: 7, fit: 1 },
      { start: 4.2, end: 9, who: 3, fit: 1 },
      { start: 9, end: 12, who: 7, fit: 1 },
    ];
    const r = linesToSpeakers([0, 4, 9], 12, spans);
    expect(r.speaker).toEqual([0, 1, 0]);
    expect(r.count).toBe(2);
    expect(r.confidence[0]).toBe(1);
  });

  it('a line split between two voices is unsure — and says so', () => {
    const spans = [{ start: 0, end: 2, who: 0, fit: 1 }, { start: 2, end: 4, who: 1, fit: 1 }];
    const r = linesToSpeakers([0], 4, spans);
    expect(r.confidence[0]).toBeLessThanOrEqual(0.5);
  });

  it('a line where nothing was heard goes to the nearest voice, flagged', () => {
    /* Line 2 runs 6–11; nobody was heard then. */
    const r = linesToSpeakers([0, 6, 11], 14, [{ start: 0, end: 5, who: 0, fit: 1 }, { start: 11, end: 14, who: 1, fit: 1 }]);
    expect(r.speaker).toEqual([0, 1, 1]);
    expect(r.confidence[1]).toBeLessThan(0.75);
    expect(r.confidence[2]).toBe(1);
  });
});

describe('naming a voice in a recorded meeting', () => {
  const m: Meeting = {
    kind: 'meeting', id: 'b1', source: 'browser', title: 't', createdAt: '2026-10-07T12:00:00Z', durationSeconds: 10,
    tasks: [], tags: [], attendees: ['Speaker 1', 'Speaker 2'],
    speakers: [
      { id: 's1', name: 'Speaker 1', voiceprintId: 'v1', colorIndex: 0 },
      { id: 's2', name: 'Speaker 2', voiceprintId: 'v2', colorIndex: 1 },
    ],
    lines: [
      { id: 'l1', speakerId: 's1', text: 'a', startsAt: 0, confidence: 0.9 },
      { id: 'l2', speakerId: 's2', text: 'b', startsAt: 3, confidence: 0.5 },
    ],
  };

  it('renames the attendee too', () => {
    expect(correctSpeaker(m, 's2', 'Dana').meeting.attendees).toEqual(['Speaker 1', 'Dana']);
  });

  it('two voices that are one person: the attendee list doesn’t show them twice', () => {
    const named = correctSpeaker(m, 's1', 'You').meeting;
    expect(correctSpeaker(named, 's2', 'You').meeting.attendees).toEqual(['You']);
  });
});

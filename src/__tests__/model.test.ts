import { describe, expect, it } from 'vitest';
import { demoCaptures } from '../data/demo';
import {
  correctSpeaker, formatDuration, linesBySpeaker, formatTimer, formatWhen, isLowConfidence, isMeeting, positionLabel,
  readPercent, suggestTasks, titleFrom, toMarkdown, turnsOf, type Meeting,
} from '../data/model';

const sync = () => demoCaptures(new Date('2026-09-30T12:00:00')).find((c) => c.id === 'c2') as Meeting;

describe('speaker correction propagates by voice', () => {
  it('renames every line in the voice, not just one, and reports how many', () => {
    const m = sync();
    const { meeting, linesChanged } = correctSpeaker(m, 's3', 'Sarah Lee');
    expect(linesChanged).toBe(4);
    const s3 = meeting.speakers.find((s) => s.id === 's3')!;
    expect(s3.name).toBe('Sarah Lee');
    expect(s3.confirmed).toBe(true);
    expect(meeting.lines.filter((l) => l.speakerId === 's3')).toHaveLength(4);
  });

  it('a confirmed speaker is no longer low confidence', () => {
    const m = sync();
    const before = m.lines.filter((l) => isLowConfidence(l, m.speakers.find((s) => s.id === l.speakerId)));
    expect(before).toHaveLength(4);
    const { meeting } = correctSpeaker(m, 's3', 'Sarah Lee');
    const after = meeting.lines.filter((l) => isLowConfidence(l, meeting.speakers.find((s) => s.id === l.speakerId)));
    expect(after).toHaveLength(0);
  });

  it('naming an existing speaker MERGES — one person is never listed twice', () => {
    const m = sync();
    const mayaLines = m.lines.filter((l) => l.speakerId === 's2').length;
    const { meeting, linesChanged } = correctSpeaker(m, 's3', 'maya chen');
    expect(linesChanged).toBe(4);
    expect(meeting.speakers.map((s) => s.id)).not.toContain('s3');
    expect(meeting.speakers.filter((s) => s.name === 'Maya Chen')).toHaveLength(1);
    expect(meeting.lines.filter((l) => l.speakerId === 's2')).toHaveLength(mayaLines + 4);
    expect(meeting.lines.some((l) => l.speakerId === 's3')).toBe(false);
  });

  it('renaming a confirmed speaker to their own name changes nothing and says so', () => {
    const m = sync();
    expect(correctSpeaker(m, 's2', 'Maya Chen').linesChanged).toBe(3); // unconfirmed: confirming her is a real change
    const confirmed = correctSpeaker(m, 's2', 'Maya Chen').meeting;
    expect(correctSpeaker(confirmed, 's2', 'maya chen')).toEqual({ meeting: confirmed, linesChanged: 0 });
  });

  it('two speaker ids sharing one voiceprint: the count covers both, as the rename does', () => {
    const m = sync();
    const split: Meeting = { ...m, speakers: [...m.speakers, { id: 's9', name: 'Speaker 9', voiceprintId: 'v-unknown-3', colorIndex: 4 }],
      lines: m.lines.map((l, i) => (i === 12 ? { ...l, speakerId: 's9' } : l)) };
    expect(linesBySpeaker(split, 's3')).toBe(4);
    const { meeting, linesChanged } = correctSpeaker(split, 's3', 'Maya Chen');
    expect(linesChanged).toBe(4);
    expect(meeting.lines.some((l) => l.speakerId === 's3' || l.speakerId === 's9')).toBe(false);
  });

  it('an empty name or unknown speaker changes nothing', () => {
    const m = sync();
    expect(correctSpeaker(m, 's3', '   ')).toEqual({ meeting: m, linesChanged: 0 });
    expect(correctSpeaker(m, 'nope', 'X')).toEqual({ meeting: m, linesChanged: 0 });
  });
});

describe('a note is not a meeting', () => {
  it('note lines are never low confidence, however low the number', () => {
    expect(isLowConfidence({ id: 'x', text: 'hi', startsAt: 0, confidence: 0.1 })).toBe(false);
  });
  it('the discriminant narrows', () => {
    const cs = demoCaptures();
    expect(cs.filter(isMeeting).every((c) => Array.isArray(c.speakers))).toBe(true);
    expect(cs.filter((c) => !isMeeting(c)).every((c) => !('speakers' in c))).toBe(true);
  });
  it('consecutive lines by one speaker form one turn', () => {
    const turns = turnsOf(sync());
    expect(turns[2].speakerId).toBe('s2');
    expect(turns[2].lines).toHaveLength(2);
  });
});

describe('read-aloud position is text-first', () => {
  it('says the line, 1-based', () => {
    expect(positionLabel({ lineIndex: 3, totalLines: 18 })).toBe('Line 4 of 18');
    expect(positionLabel({ lineIndex: 0, totalLines: 0 })).toBe('Nothing to read');
  });
  it('percent runs 0 on the first line to 100 on the last', () => {
    expect(readPercent({ lineIndex: 0, totalLines: 5 })).toBe(0);
    expect(readPercent({ lineIndex: 4, totalLines: 5 })).toBe(100);
    expect(readPercent({ lineIndex: 0, totalLines: 1 })).toBe(100);
    expect(readPercent({ lineIndex: 0, totalLines: 0 })).toBe(0);
  });
});

describe('demo data is internally consistent', () => {
  it('no capture is dated in the future, whatever time the demo opens', () => {
    for (const hour of [0, 6, 9, 13, 23]) {
      const now = new Date(2026, 8, 30, hour, 5);
      for (const c of demoCaptures(now)) expect(new Date(c.createdAt).getTime(), `${c.id} at ${hour}h`).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('every task points at a line that exists', () => {
    for (const c of demoCaptures()) {
      for (const t of c.tasks) expect(c.lines.some((l) => l.id === t.sourceLineId), `${c.id}/${t.id}`).toBe(true);
    }
  });
  it('duration covers the last line — no "32 min" over 90 seconds of text', () => {
    for (const c of demoCaptures()) {
      expect(c.durationSeconds).toBeGreaterThan(c.lines[c.lines.length - 1].startsAt);
    }
  });
  it('every line speaker exists on its meeting', () => {
    for (const c of demoCaptures().filter(isMeeting)) {
      for (const l of c.lines) expect(c.speakers.some((s) => s.id === l.speakerId)).toBe(true);
    }
  });
  it('at least one task is unassigned, so the empty state is exercised', () => {
    expect(demoCaptures().flatMap((c) => c.tasks).some((t) => !t.assignee)).toBe(true);
  });
});

describe('task suggestion by phrasing', () => {
  const l = (id: string, text: string) => ({ id, text, startsAt: 0, confidence: 0.9 });
  it('picks up task openers and tidies them', () => {
    const ts = suggestTasks([
      l('a', 'we need to send the proposal by Friday.'),
      l('b', 'The weather is nice.'),
      l('c', "Okay, let's schedule the review"),
      l('d', 'Follow up with Dana'),
    ]);
    expect(ts.map((t) => t.text)).toEqual(['We need to send the proposal by Friday', "Let's schedule the review", 'Follow up with Dana']);
    expect(ts.map((t) => t.sourceLineId)).toEqual(['a', 'c', 'd']);
    expect(ts.every((t) => t.status === 'todo')).toBe(true);
  });
  it('does not fire on a word in the middle of a sentence', () => {
    expect(suggestTasks([l('a', 'I think we should probably not.')])).toHaveLength(0);
  });
});

describe('formatting', () => {
  it('durations and timers', () => {
    expect(formatDuration(272)).toBe('4:32');
    expect(formatDuration(3730)).toBe('1:02:10');
    expect(formatTimer(272)).toBe('00:04:32');
  });
  it('relative days', () => {
    const now = new Date('2026-09-30T18:00:00');
    expect(formatWhen('2026-09-30T14:34:00', now)).toMatch(/^Today · 2:34/);
    expect(formatWhen('2026-09-29T09:10:00', now)).toMatch(/^Yesterday · 9:10/);
    expect(formatWhen('2026-09-22T16:00:00', now)).toMatch(/^Sep 22 · 4:00/);
  });
  it('titles from the first words', () => {
    const l = (text: string) => [{ id: 'a', text, startsAt: 0, confidence: 1 }];
    expect(titleFrom(l('Quick thought on pricing.'), 'x')).toBe('Quick thought on pricing');
    expect(titleFrom(l('one two three four five six seven eight nine'), 'x')).toBe('one two three four five six seven…');
    expect(titleFrom([], 'New Mumble')).toBe('New Mumble');
  });
  it('markdown export labels the summary as AI-generated and names speakers', () => {
    const md = toMarkdown(sync());
    expect(md).toContain('## Summary (AI-generated)');
    expect(md).toContain('**Maya Chen:**');
    expect(md).toContain('- [ ] Follow up with design team on dashboard — You');
  });
});

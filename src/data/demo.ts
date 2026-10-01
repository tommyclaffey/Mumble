import type { Capture, TranscriptLine } from './model';

/**
 * Demo captures.
 *
 * The copy is lifted from the published mockups (the brainstorm session, the
 * Product Sync) so the running app and the case study tell the same story.
 *
 * Dates are generated relative to "now" so "Today" is true on the day the demo
 * is opened, not the day it was written — and never in the future: a demo
 * note dated 2:34 PM, opened at 9 AM, used to sort above a real recording
 * made at 9:05.
 *
 * ⚠️ Durations are derived from the last line, not typed in. The mockups say
 * "Product Sync · 32 min" over a dozen lines — a demo that claims 32 minutes
 * and shows 90 seconds of transcript is the kind of mismatch a reviewer finds.
 */

/** A time N minutes before now — for "today" captures, which must never be in the future. */
function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function ago(now: Date, days: number, hour: number, minute: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

type Raw = [speakerId: string | undefined, text: string, confidence?: number];

/** Spreads lines across time at a roughly spoken pace (~2.6 words/sec). */
function lines(prefix: string, raw: Raw[]): TranscriptLine[] {
  let t = 0;
  return raw.map(([speakerId, text, confidence = 0.95], i) => {
    const line: TranscriptLine = { id: `${prefix}-l${i + 1}`, speakerId, text, startsAt: Math.round(t), confidence };
    t += text.split(/\s+/).length / 2.6 + 1.2;
    return line;
  });
}

function duration(ls: TranscriptLine[]): number {
  const last = ls[ls.length - 1];
  return last ? last.startsAt + Math.ceil(last.text.split(/\s+/).length / 2.6) + 2 : 0;
}

export function demoCaptures(now: Date = new Date()): Capture[] {
  /* ---- 1 · the brainstorm (a NOTE — one voice, no speakers) ---------- */
  const brainstorm = lines('c1', [
    [undefined, "Okay, I'm thinking through the new onboarding flow for our enterprise clients."],
    [undefined, 'The current setup has too many steps before someone reaches real value.'],
    [undefined, 'We need to revisit the dashboard layout so key metrics surface first.'],
    [undefined, 'Right now users have to dig three levels deep to find their reports.'],
    [undefined, 'For Q3 I want to push toward a mobile-first approach across the board.'],
    [undefined, 'A lot of our enterprise users check in from their phones between meetings.'],
    [undefined, "Let's schedule a mobile review session with the design team for early Q3."],
    [undefined, 'We should also audit the whole enterprise onboarding funnel first.'],
    [undefined, 'I want to see where people are actually dropping off in the current flow.'],
    [undefined, 'The setup screen looked like the biggest blocker last quarter.'],
    [undefined, 'Follow up with the design team about the dashboard direction this week.'],
    [undefined, 'And once onboarding is sorted we should loop back on the reporting flow before the next sprint kicks off.'],
  ]);

  /* ---- 2 · Product Sync (a MEETING — the speaker-confidence story) ----
     s3 is the point. The diarizer had no voiceprint for Sarah in the first
     seconds, so her opening turn landed at 0.52 and got a placeholder name.
     It then matched the same voice three more times. One correction should
     fix all four. */
  const sync = lines('c2', [
    ['s3', "Alright, let's kick off the product sync. Main topic is enterprise onboarding and the dashboard redesign.", 0.52],
    ['s1', 'Maya, do you want to walk us through where people are dropping off?'],
    ['s2', 'Sure. Most drop-off is in the current setup. Three levels deep before anyone reaches a report.'],
    ['s2', 'The setup screen was the biggest blocker last quarter, by a lot.'],
    ['s3', 'So we agreed to prioritise a mobile-first layout for Q3, right?', 0.71],
    ['s1', 'Yes. Most enterprise users check in from their phones between meetings.'],
    ['s4', 'I need to raise the API scoping question before we commit to a timeline.'],
    ['s4', "Engineering needs to size it. It can't be estimated from the mockups alone."],
    ['s3', "Let's get that estimate out this week so the timeline isn't a guess.", 0.68],
    ['s1', 'Follow up with the design team on the dashboard, I can own that one.'],
    ['s2', 'Schedule the mobile review for early Q3 and put it on the shared calendar.'],
    ['s4', 'I also need to update the client on the Phase 2 timeline once we have the number.'],
    ['s3', 'Good. Action items go to design and engineering before next sync.', 0.74],
  ]);

  /* ---- 3 · standup (a MEETING, fully confident — the happy path) ----- */
  const standup = lines('c3', [
    ['s1', 'Quick one today. Sprint is on track, two tickets carried over.'],
    ['s2', 'The payments integration is blocked on the sandbox keys from the vendor.'],
    ['s1', 'Send the vendor a nudge today, it has been a week.'],
    ['s3', 'Design handoff for the settings screens is done and in the tracker.'],
    ['s2', 'We should demo the new filters on Friday instead of Thursday.'],
    ['s1', "Fine by me. That's everything, thanks all."],
  ]);

  /* ---- 4 · a solo idea (a NOTE, no tasks — the empty state is real) -- */
  const idea = lines('c4', [
    [undefined, 'Idea for the read-aloud feature. What if the reading speed remembered itself per document.'],
    [undefined, 'Some notes I skim at one and a half times, meeting transcripts I want slower.'],
    [undefined, 'Not sure it is worth the setting. Worth watching whether people change speed mid-document.'],
  ]);

  /* ---- 5 · client call (a MEETING) ------------------------------------ */
  const client = lines('c5', [
    ['s1', 'Thanks for making the time. We wanted to show where the new reporting view landed.'],
    ['s2', 'Looks cleaner. My team mostly wants the weekly export to stop breaking.'],
    ['s1', 'Understood. We need to fix the export date range before anything else.'],
    ['s2', "And please make sure the numbers match what's on the dashboard."],
    ['s1', 'They will. Follow up with a written summary by Thursday.'],
  ]);

  return [
    {
      kind: 'note', id: 'c1', source: 'demo',
      title: 'Product brainstorm session',
      createdAt: minutesAgo(now, 25),
      durationSeconds: duration(brainstorm),
      lines: brainstorm,
      tags: ['Product', 'Ideas'],
      tasks: [
        { id: 'c1-t1', text: 'Revisit the dashboard layout so key metrics surface first', sourceLineId: 'c1-l3', status: 'todo' },
        { id: 'c1-t2', text: 'Schedule a mobile review session with design for early Q3', sourceLineId: 'c1-l7', status: 'in-progress' },
        { id: 'c1-t3', text: 'Audit the enterprise onboarding funnel', sourceLineId: 'c1-l8', status: 'todo' },
        { id: 'c1-t4', text: 'Follow up with design about the dashboard direction', sourceLineId: 'c1-l11', status: 'todo' },
        { id: 'c1-t5', text: 'Loop back on the reporting flow before next sprint', sourceLineId: 'c1-l12', status: 'todo' },
      ],
      summary: 'You flagged the enterprise onboarding flow as too long, and set Q3 priorities: a dashboard redesign and a mobile-first approach, with follow-ups for design.',
    },
    {
      kind: 'meeting', id: 'c2', source: 'demo',
      title: 'Product Sync',
      createdAt: minutesAgo(now, 190),
      durationSeconds: duration(sync),
      lines: sync,
      tags: ['Product', 'Sprint', 'Design'],
      attendees: ['You', 'Maya Chen', 'John Park', 'Sarah Lee'],
      speakers: [
        { id: 's1', name: 'You', voiceprintId: 'v-you', colorIndex: 0, confirmed: true },
        { id: 's2', name: 'Maya Chen', voiceprintId: 'v-maya', colorIndex: 1 },
        { id: 's3', name: 'Speaker 3', voiceprintId: 'v-unknown-3', colorIndex: 2 },
        { id: 's4', name: 'John Park', voiceprintId: 'v-john', colorIndex: 3 },
      ],
      tasks: [
        { id: 'c2-t1', text: 'Follow up with design team on dashboard', sourceLineId: 'c2-l10', assignee: 'You', status: 'todo' },
        { id: 'c2-t2', text: 'Schedule mobile review for Q3', sourceLineId: 'c2-l11', assignee: 'Maya Chen', status: 'todo' },
        { id: 'c2-t3', text: 'Update client on Phase 2 timeline', sourceLineId: 'c2-l12', assignee: 'John Park', status: 'todo' },
        /* Kept unassigned on purpose — the empty state has to exist somewhere
           real, or nobody notices when it breaks. */
        { id: 'c2-t4', text: 'Get the API estimate out this week', sourceLineId: 'c2-l9', status: 'in-progress' },
      ],
      summary: 'Drop-off is concentrated in setup. The team committed to a mobile-first layout for Q3; engineering must size the API work before a timeline is promised. Owners assigned for design follow-up, the mobile review and the client update.',
    },
    {
      kind: 'meeting', id: 'c3', source: 'demo',
      title: 'Weekly team standup',
      createdAt: ago(now, 1, 9, 10),
      durationSeconds: duration(standup),
      lines: standup,
      tags: ['Meetings', 'Team'],
      attendees: ['You', 'Alex Rivera', 'Sarah Lee'],
      speakers: [
        { id: 's1', name: 'You', voiceprintId: 'v-you', colorIndex: 0, confirmed: true },
        { id: 's2', name: 'Alex Rivera', voiceprintId: 'v-alex', colorIndex: 1 },
        { id: 's3', name: 'Sarah Lee', voiceprintId: 'v-sarah', colorIndex: 2 },
      ],
      tasks: [
        { id: 'c3-t1', text: 'Nudge the vendor for sandbox keys', sourceLineId: 'c3-l3', assignee: 'You', status: 'done' },
        { id: 'c3-t2', text: 'Move the filters demo to Friday', sourceLineId: 'c3-l5', assignee: 'Alex Rivera', status: 'todo' },
      ],
      summary: 'Sprint on track with two carry-overs. Payments is blocked on vendor sandbox keys; the filters demo moves to Friday.',
    },
    {
      kind: 'note', id: 'c4', source: 'demo',
      title: 'Read-aloud speed idea',
      createdAt: ago(now, 3, 21, 5),
      durationSeconds: duration(idea),
      lines: idea,
      tags: ['Ideas'],
      tasks: [],
      summary: 'A thought on remembering reading speed per document — unresolved whether it earns a setting.',
    },
    {
      kind: 'meeting', id: 'c5', source: 'demo',
      title: 'Client call — Northbank',
      createdAt: ago(now, 6, 16, 0),
      durationSeconds: duration(client),
      lines: client,
      tags: ['Client'],
      attendees: ['You', 'Dana Whitfield'],
      speakers: [
        { id: 's1', name: 'You', voiceprintId: 'v-you', colorIndex: 0, confirmed: true },
        { id: 's2', name: 'Dana Whitfield', voiceprintId: 'v-dana', colorIndex: 1 },
      ],
      tasks: [
        { id: 'c5-t1', text: 'Fix the export date range', sourceLineId: 'c5-l3', assignee: 'You', status: 'in-progress' },
        { id: 'c5-t2', text: 'Send Northbank a written summary by Thursday', sourceLineId: 'c5-l5', assignee: 'You', status: 'todo' },
      ],
      summary: 'Northbank likes the new reporting view. Their priority is a reliable weekly export whose numbers match the dashboard.',
    },
  ];
}

import { ago, demoCaptures, duration, lines, minutesAgo } from './demo.ts';
import type { Capture } from './model';

/**
 * The team demo's recordings: the five personal demo recordings (you made
 * them — you're Jordan here), plus two your teammates made and shared. Those
 * two are the point: a team workspace is where recordings you didn't make
 * show up, with the face of whoever made them.
 *
 * Voiced like the rest by scripts/make-demo-audio.mjs, one voice per person.
 */
export function teamCaptures(now: Date = new Date()): Capture[] {
  /* ---- t1 · Nadia's research readout (a MEETING she recorded) ---------- */
  const readout = lines('t1', [
    ['s1', 'Thanks for joining. Round two was six sessions, all enterprise admins, all on the new setup flow.'],
    ['s1', 'Short version: setup time dropped from about nine minutes to under four.'],
    ['s2', "That's the collapsed steps doing their job. Where did people still get stuck?"],
    ['s1', 'The permissions screen. Four of six paused there, and two asked what a workspace role even was.'],
    ['s3', 'We need to rewrite the role descriptions before the beta goes wider.'],
    ['s2', 'I can mock a version with plain-language roles and an example under each one.'],
    ['s4', "Let's make sure engineering sees the clips, not just the summary."],
    ['s1', "I'll cut a three-minute highlight reel and post it in the research channel by Friday."],
    ['s3', 'Schedule a quick review of the new role copy for Tuesday.'],
    ['s1', 'Last thing. Nobody found the export button. Every single participant scrolled past it.'],
    ['s2', "Then it's in the wrong place. Follow up with me on moving it into the header."],
  ]);

  /* ---- t2 · Maya's crit notes (a NOTE — her voice, nobody else's) ------ */
  const crit = lines('t2', [
    [undefined, "Notes from this morning's design crit on empty states."],
    [undefined, "The tasks page with nothing on it just says no tasks, and that's a dead end."],
    [undefined, 'It should tell you how tasks get there. Say something like we need to, and it shows up here.'],
    [undefined, 'We should show one example task, greyed out, so the page explains itself.'],
    [undefined, 'Same idea for tags. An empty tags page should offer the three tags people use most.'],
    [undefined, 'Alex thinks the illustrations are too heavy for a work tool. I mostly agree.'],
    [undefined, "Send Alex the lighter icon set before Thursday's build."],
  ]);

  return [
    ...demoCaptures(now),
    {
      kind: 'note', id: 't2', source: 'demo', recordedBy: 'Maya Chen',
      title: 'Design crit — empty states',
      createdAt: minutesAgo(now, 75),
      durationSeconds: duration(crit),
      lines: crit,
      tags: ['Design', 'Ideas'],
      tasks: [
        { id: 't2-t1', text: 'Show a greyed-out example on the empty Tasks page', sourceLineId: 't2-l4', assignee: 'Maya Chen', status: 'todo' },
        { id: 't2-t2', text: 'Send Alex the lighter icon set before Thursday', sourceLineId: 't2-l7', assignee: 'Maya Chen', status: 'todo' },
      ],
      summary: 'Empty states should explain how things arrive instead of saying “nothing here”: an example task on Tasks, suggested tags on Tags. Lighter icons go to Alex before Thursday.',
    },
    {
      kind: 'meeting', id: 't1', source: 'demo', recordedBy: 'Nadia Haddad',
      title: 'Usability round 2 — readout',
      createdAt: ago(now, 2, 14, 0),
      durationSeconds: duration(readout),
      lines: readout,
      tags: ['Research', 'Design'],
      attendees: ['Nadia Haddad', 'Maya Chen', 'Sarah Lee', 'You'],
      speakers: [
        { id: 's1', name: 'Nadia Haddad', voiceprintId: 'v-nadia', colorIndex: 1, confirmed: true },
        { id: 's2', name: 'Maya Chen', voiceprintId: 'v-maya', colorIndex: 2, confirmed: true },
        { id: 's3', name: 'Sarah Lee', voiceprintId: 'v-sarah', colorIndex: 3, confirmed: true },
        { id: 's4', name: 'You', voiceprintId: 'v-you', colorIndex: 0, confirmed: true },
      ],
      tasks: [
        { id: 't1-t1', text: 'Rewrite the workspace role descriptions before the wider beta', sourceLineId: 't1-l5', assignee: 'Sarah Lee', status: 'todo' },
        { id: 't1-t2', text: 'Mock plain-language roles with an example under each', sourceLineId: 't1-l6', assignee: 'Maya Chen', status: 'in-progress' },
        { id: 't1-t3', text: 'Cut a three-minute highlight reel for the research channel', sourceLineId: 't1-l8', assignee: 'Nadia Haddad', status: 'todo' },
        { id: 't1-t4', text: 'Review the new role copy on Tuesday', sourceLineId: 't1-l9', assignee: 'You', status: 'todo' },
        { id: 't1-t5', text: 'Move the export button into the header', sourceLineId: 't1-l11', assignee: 'Maya Chen', status: 'todo' },
      ],
      summary: 'Round two cut setup from about nine minutes to under four. The permissions screen is the new sticking point, and no participant found export. Owners set for the role copy, a mockup, a highlight reel and moving export.',
    },
  ];
}

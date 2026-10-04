import { isMeeting, openTasks, type Capture } from './model';
import type { RecentFilter } from './route';

/** One search rule for every list — titles, summaries, tags AND the words spoken. */
export function matches(c: Capture, filter: RecentFilter, query: string): boolean {
  if (filter === 'notes' && isMeeting(c)) return false;
  if (filter === 'meetings' && !isMeeting(c)) return false;
  if (filter === 'tasks' && openTasks(c) === 0) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [c.title, c.summary ?? '', ...c.tags, ...c.lines.map((l) => l.text)]
    .some((s) => s.toLowerCase().includes(q));
}

/** Home groups recordings by day: "Today" / "Yesterday" / "Earlier this week" / "Earlier". */
export function dayGroup(iso: string, now: Date = new Date()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  return 'Earlier';
}

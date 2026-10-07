import { useState } from 'react';
import { Avatar, colorFor } from '../components/Avatar/Avatar';
import { CaptureCard } from '../components/CaptureCard/CaptureCard';
import { ChipFilter } from '../components/Chip/Chip';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { matches } from '../data/filters';
import { isLowConfidence, isMeeting, linesBySpeaker, openTasks, type Meeting } from '../data/model';
import { href } from '../data/route';
import { useStore } from '../data/store';
import { useListPlayer } from '../playback/useListPlayer';
import './screens.css';
import './MeetingsScreen.css';
import { DictateButton } from '../components/Dictate/Dictate';

/**
 * Meetings — the list (Figma page 07, frame 07). A meeting opens the same
 * note screen as everything else: one detail view for a recording, not three
 * (the flow fix from the refinement diagnosis).
 *
 * The side panel: who you meet with (press a person to see only their
 * meetings), and voices the model wasn't sure of — each a link to the line
 * where you can say who it was.
 */
type When = 'all' | 'week' | 'open';
const WHEN: { id: When; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'week', label: 'This week' }, { id: 'open', label: 'With open tasks' },
];
const WEEK = 7 * 86_400_000;

export function MeetingsScreen() {
  const { captures } = useStore();
  const [query, setQuery] = useState('');
  const [when, setWhen] = useState<When>('all');
  const [person, setPerson] = useState<string | null>(null);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [now] = useState(() => Date.now());
  const q = query.trim().toLowerCase();
  const all = captures.filter(isMeeting);
  const test = (m: Meeting, w: When) => (w === 'week' ? now - new Date(m.createdAt).getTime() < WEEK : w === 'open' ? openTasks(m) > 0 : true);
  const meetings = all
    .filter((c) => matches(c, 'all', query) || c.attendees.some((a) => a.toLowerCase().includes(q)))
    .filter((m) => test(m, when) && (person === null || m.attendees.includes(person)))
    .sort((a, b) => (oldestFirst ? a : b).createdAt.localeCompare((oldestFirst ? b : a).createdAt));
  const player = useListPlayer(meetings);

  const people = new Map<string, number>();
  for (const m of all) for (const a of m.attendees) people.set(a, (people.get(a) ?? 0) + 1);
  const unsure = all.flatMap((m) => m.speakers
    .filter((s) => !s.confirmed && m.lines.some((l) => l.speakerId === s.id && isLowConfidence(l, s)))
    .map((s) => ({ m, s, line: m.lines.findIndex((l) => l.speakerId === s.id) + 1 })));

  const panel = (
    <>
      <PanelCard id="people-h" title="People" icon="user" meta={person ? <button type="button" className="mb-link-button" onClick={() => setPerson(null)}>Show everyone</button> : people.size}>
        <ul className="mb-prows">
          {[...people.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => (
            <li key={name}>
              <button type="button" className={`mb-prow mb-owner${person === name ? ' is-on' : ''}`} aria-pressed={person === name}
                onClick={() => setPerson((p) => (p === name ? null : name))}>
                <Avatar name={name} colorIndex={colorFor(name)} size="md" />
                <span className="mb-t-body-sm mb-owner-name">{name}</span>
                <span className="mb-t-meta mb-muted">{n} {n === 1 ? 'meeting' : 'meetings'}</span>
              </button>
            </li>
          ))}
        </ul>
      </PanelCard>
      {unsure.length > 0 && (
        <PanelCard id="voices-h" title="Voices to confirm" icon="help" meta={unsure.length} desktopOnly>
          <ul className="mb-prows">
            {unsure.map(({ m, s, line }) => (
              <li key={`${m.id}-${s.id}`}>
                <div className="mb-prow">
                  <Avatar name={s.name} colorIndex={s.colorIndex} unconfirmed size="md" />
                  <div className="mb-prow-text">
                    <span className="mb-t-body-sm">{s.name}</span>
                    <span className="mb-t-meta mb-muted">{m.title} · {linesBySpeaker(m, s.id)} lines, same voice</span>
                  </div>
                </div>
                <a className="mb-button is-md is-block mb-voice-who" href={href({ name: 'capture', id: m.id, line })}>Who is this?</a>
              </li>
            ))}
          </ul>
          <p className="mb-t-meta mb-muted">One answer fixes every line in that voice.</p>
        </PanelCard>
      )}
    </>
  );

  return (
    <Page title="Meetings" subtitle={`${all.length} meetings with ${people.size} people`} panel={panel} panelLabel="People">
      {/* Phone: the voices to confirm, one card under the title (Figma M07). */}
      {unsure.length > 0 && (
        <div className="mb-phone-only mb-phone-card">
          <div className="mb-prow" style={{ padding: 0 }}>
            <Avatar name={unsure[0].s.name} colorIndex={unsure[0].s.colorIndex} unconfirmed size="md" />
            <div className="mb-prow-text">
              <p className="mb-t-label" style={{ margin: 0, color: 'var(--text-strong)' }}>{unsure.length} {unsure.length === 1 ? 'voice' : 'voices'} to confirm</p>
              <span className="mb-t-meta mb-muted">{unsure[0].s.name} · {unsure[0].m.title}</span>
            </div>
            <a className="mb-button is-sm mb-voice-who" style={{ margin: 0 }} href={href({ name: 'capture', id: unsure[0].m.id, line: unsure[0].line })}>Who is this?</a>
          </div>
        </div>
      )}
      <label className="mb-search mb-search-page">
        <Icon name="search" size={16} />
        <span className="mb-sr-only">Search meetings</span>
        <input data-search type="search" placeholder="Search meetings or people" value={query} onChange={(e) => setQuery(e.target.value)} />
        <DictateButton label="Search meetings by voice" plain size="sm" onText={setQuery} />
      </label>
      <div className="mb-viewbar">
        <div className="mb-filterbar" role="group" aria-label="Filter meetings">
          {WHEN.map((w) => (
            <ChipFilter key={w.id} pressed={when === w.id} onClick={() => setWhen(w.id)}>
              {w.label} <span className="mb-chip-count">{all.filter((m) => test(m, w.id)).length}</span>
            </ChipFilter>
          ))}
        </div>
        <div className="mb-viewbar-end">
          <label className="mb-dropdown-wrap">
            <span className="mb-sr-only">Order</span>
            <select className="mb-dropdown" value={oldestFirst ? 'oldest' : 'newest'} onChange={(e) => setOldestFirst(e.target.value === 'oldest')}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <Icon name="chevron-down" size={14} />
          </label>
        </div>
      </div>
      {meetings.length === 0 ? (
        <div className="mb-empty"><p>{query || person || when !== 'all' ? 'No meetings match.' : 'No meetings yet.'}</p></div>
      ) : (
        <ul className="mb-list" aria-label="Meetings">
          {meetings.map((m) => (
            <li key={m.id}>
              <CaptureCard variant="meeting" level={2} capture={m} playing={player.isPlaying(m.id)} progress={player.progressOf(m.id)} onPlay={() => player.toggle(m.id)} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

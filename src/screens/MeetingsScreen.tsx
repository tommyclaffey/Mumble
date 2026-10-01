import { useEffect, useRef, useState } from 'react';
import { Avatar, colorFor } from '../components/Avatar/Avatar';
import { CaptureCard } from '../components/CaptureCard/CaptureCard';
import { ChipMeta } from '../components/Chip/Chip';
import { Icon } from '../components/Icon/Icon';
import { PlayerBar } from '../components/PlayerBar/PlayerBar';
import { Surface } from '../components/Surface/Surface';
import { TagEditor } from '../components/TagEditor/TagEditor';
import { TaskCard } from '../components/TaskCard/TaskCard';
import { matches } from '../data/filters';
import { formatDuration, isMeeting, type Meeting } from '../data/model';
import { go, href } from '../data/route';
import { useStore } from '../data/store';
import { usePlayer } from '../playback/usePlayer';
import './screens.css';
import './MeetingsScreen.css';

/**
 * Meetings — list + detail, as in the design (and the published mockup):
 * the meetings on the left, the chosen one on the right with its attendees,
 * recording, summary, tasks and tags. Opening the full transcript is one
 * link away.
 *
 * ONE player for the screen: a card's play button plays that meeting in the
 * detail panel, so two recordings can never overlap.
 */
export function MeetingsScreen({ id }: { id?: string }) {
  const { captures, prefs, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const meetings = captures
    .filter(isMeeting)
    .filter((c) => matches(c, 'all', query) || c.attendees.some((a) => a.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = meetings.find((m) => m.id === id) ?? meetings[0];
  const player = usePlayer(selected, prefs.speed);

  /* Play from a card: select it, then play once its recording is attached. */
  const [pending, setPending] = useState<string | undefined>();
  const { play } = player;
  useEffect(() => {
    if (pending && selected?.id === pending) { setPending(undefined); play(); }
  }, [pending, selected?.id, play]);

  /* On narrower screens the detail sits BELOW the list, so choosing a meeting
     would look like nothing happened. Bring the detail into view. */
  const detailRef = useRef<HTMLElement>(null);
  const lastId = useRef(id);
  useEffect(() => {
    if (lastId.current === id) return;
    lastId.current = id;
    if (window.matchMedia?.('(max-width: 1199px)').matches) detailRef.current?.scrollIntoView?.({ block: 'start' });
  }, [id]);

  function playCard(m: Meeting) {
    if (m.id === selected?.id) { player.toggle(); return; }
    go({ name: 'meetings', id: m.id });
    setPending(m.id);
  }

  const allTags = [...new Set(captures.flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mb-split mb-meetings-split">
      <section className="mb-split-list" aria-labelledby="meetings-h">
        <h1 id="meetings-h" className="mb-display-page mb-page-title">Meetings</h1>
        <label className="mb-search mb-split-search">
          <Icon name="search" size={16} />
          <span className="mb-sr-only">Search meetings</span>
          <input data-search type="search" placeholder="Search meetings or people" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {meetings.length === 0 ? (
          <div className="mb-empty"><p>{query ? `No meetings match “${query}”.` : 'No meetings yet.'}</p></div>
        ) : (
          <ul className="mb-list" aria-label="Meetings">
            {meetings.map((m) => (
              <li key={m.id}>
                <CaptureCard
                  variant="compact" capture={m} selected={m.id === selected?.id}
                  linkTo={href({ name: 'meetings', id: m.id })}
                  playing={m.id === selected?.id && player.playing}
                  progress={m.id === selected?.id && player.started ? { time: player.time, duration: player.duration, line: player.line } : undefined}
                  onPlay={() => playCard(m)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-split-rule" aria-hidden="true" />

      {selected && (
        <section ref={detailRef} className="mb-split-detail mb-meeting" aria-labelledby="meeting-h">
          <h2 id="meeting-h" className="mb-display-page mb-meeting-title">{selected.title}</h2>
          {/* Pills under the title in the frame (Chip / Tag shape). */}
          <div className="mb-card-chips">
            <span className="mb-chip is-tag"><span className="mb-tabular">{formatDuration(selected.durationSeconds)}</span></span>
            <span className="mb-chip is-tag">{new Date(selected.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>

          <h3 className="mb-detail-label">Attendees</h3>
          <div className="mb-card-chips">
            {selected.attendees.map((a) => (
              <span key={a} className="mb-person">
                <Avatar name={a} colorIndex={colorFor(a, selected.speakers)} size="sm" />
                <span className="mb-label">{a}</span>
              </span>
            ))}
          </div>

          <h3 className="mb-detail-label">Audio Playback</h3>
          <PlayerBar compact player={player} title={selected.title} speed={prefs.speed} onSpeed={(speed) => dispatch({ type: 'setPrefs', prefs: { speed } })} />

          {/* The frame shows the transcript itself here — the opening lines, as
              one passage — with the full, line-by-line view a click away. */}
          <h3 className="mb-detail-label">Transcript</h3>
          <Surface tone="ai" className="mb-meeting-excerpt">
            <p className="mb-body">{selected.lines.slice(0, 6).map((l) => l.text).join(' ')}</p>
          </Surface>
          <a className="mb-link-row mb-meeting-open" href={href({ name: 'capture', id: selected.id })}>
            View full transcript <span aria-hidden="true">→</span>
          </a>

          <h3 className="mb-heading-card mb-detail-h">
            Extracted Tasks <ChipMeta tone="count">{selected.tasks.length}</ChipMeta>
          </h3>
          {selected.tasks.length === 0 ? <p className="mb-body mb-muted">No tasks in this meeting.</p> : (
            <ul className="mb-list mb-list-tight">
              {selected.tasks.map((t) => (
                <li key={t.id}>
                  <TaskCard
                    task={t} people={selected.attendees}
                    onToggle={(done) => dispatch({ type: 'setTaskStatus', captureId: selected.id, taskId: t.id, status: done ? 'done' : 'todo' })}
                    onStatus={(status) => dispatch({ type: 'setTaskStatus', captureId: selected.id, taskId: t.id, status })}
                    onDue={(due) => dispatch({ type: 'replaceCapture', capture: { ...selected, tasks: selected.tasks.map((x) => (x.id === t.id ? { ...x, due } : x)) } })}
                    href={href({ name: 'capture', id: selected.id, line: selected.lines.findIndex((l) => l.id === t.sourceLineId) + 1 || undefined })}
                    onAssign={(who) => dispatch({ type: 'replaceCapture', capture: { ...selected, tasks: selected.tasks.map((x) => (x.id === t.id ? { ...x, assignee: who } : x)) } })}
                  />
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-detail-label">Tags</h3>
          <TagEditor tags={selected.tags} allTags={allTags} onChange={(tags) => dispatch({ type: 'updateCapture', captureId: selected.id, patch: { tags } })} />
        </section>
      )}
    </div>
  );
}

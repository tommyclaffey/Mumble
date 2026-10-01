import { ChipMeta, ChipTag } from '../Chip/Chip';
import { PlayButton } from '../PlayButton/PlayButton';
import { Surface } from '../Surface/Surface';
import { Track } from '../Track/Track';
import { href } from '../../data/route';
import { formatDuration, formatWhen, isMeeting, openTasks, positionLabel, type Capture } from '../../data/model';

/** "Today" / "Yesterday" / "Jul 19" — the Meetings list's short date. */
function shortWhen(iso: string): string {
  return formatWhen(iso).split(' · ')[0];
}
import './CaptureCard.css';

/**
 * A capture in a list. Two layouts, both from the design:
 *
 *   feed     Home Feed — title + time, the AI summary, tags with the task
 *            count pinned right, a rule, the player.
 *   compact  the Meetings list — title + date, three facts (length,
 *            attendees, tasks), a rule, the player. `selected` marks the one
 *            shown in the detail panel.
 *
 * The whole card is clickable (the title link stretches over it), while the
 * play button and tag links sit above and do their own thing. One link per
 * card for a screen reader — not a card-sized button around its controls.
 */
export function CaptureCard(
  { capture, playing, progress, onPlay, variant = 'feed', selected, linkTo }:
  {
    capture: Capture; playing: boolean; onPlay: () => void;
    progress?: { time: number; duration: number; line: number };
    variant?: 'feed' | 'compact';
    selected?: boolean;
    /** Where the title goes. Defaults to the capture page. */
    linkTo?: string;
  },
) {
  const open = openTasks(capture);
  /* While playing: live position. Otherwise: how far it was listened to. */
  const pct = progress && progress.duration ? (progress.time / progress.duration) * 100
    : capture.listenedTo && capture.durationSeconds ? Math.min(100, (capture.listenedTo / capture.durationSeconds) * 100) : 0;
  const where = progress
    ? `${positionLabel({ lineIndex: progress.line, totalLines: capture.lines.length })}, ${formatDuration(progress.time)}`
    : capture.listenedTo ? `Listened to ${formatDuration(capture.listenedTo)} of ${formatDuration(capture.durationSeconds)}` : 'Not started';
  const tasks = `${open} ${open === 1 ? 'task' : 'tasks'}`;

  return (
    <Surface as="article" className={`mb-card mb-stretch is-${variant}${selected ? ' is-selected' : ''}`}>
      <div className="mb-card-head">
        <h2 className={`${variant === 'compact' ? 'mb-heading-sub' : 'mb-heading-card'} mb-card-title`}>
          {/* The card's one link — stretched over the whole card (.mb-stretch). */}
          <a className="mb-stretch-link" href={linkTo ?? href({ name: 'capture', id: capture.id })} aria-current={selected ? 'true' : undefined}>{capture.title}</a>
        </h2>
        <span className="mb-card-when">{variant === 'compact' ? shortWhen(capture.createdAt) : formatWhen(capture.createdAt)}</span>
      </div>

      {variant === 'feed' && capture.summary && <p className="mb-body-small mb-card-summary">{capture.summary}</p>}

      {variant === 'compact' && (
        <div className="mb-card-chips">
          <ChipMeta><span className="mb-tabular">{formatDuration(capture.durationSeconds)}</span></ChipMeta>
          {isMeeting(capture) && <ChipMeta>{capture.attendees.length} attendees</ChipMeta>}
          <ChipMeta>{tasks}</ChipMeta>
        </div>
      )}

      <div className="mb-card-rule" aria-hidden="true" />

      {/* The design's bottom row: play · track · length · tags · task count —
          one line, the track taking whatever room is left. */}
      <div className="mb-card-foot">
        {capture.audio ? (
          <>
            <span className="mb-raise"><PlayButton size="xs" playing={playing} onClick={onPlay} label={`recording of ${capture.title}`} /></span>
            <Track percent={pct} label={`Position in recording, ${capture.title}`} valueText={where} />
          </>
        ) : (
          <span className="mb-meta mb-muted mb-card-noaudio">No recording · transcript only</span>
        )}
        {variant === 'feed' && (
          <>
            <span className="mb-body-small mb-tabular mb-card-len">{formatDuration(capture.durationSeconds)}</span>
            {/* A fixed column, so every card's track ends at the same x and the
                lengths, tags and counts line up down the page (as in the frame).
                Two tags fit; the rest collapse to "+N". */}
            <span className="mb-card-tags">
              {capture.tags.slice(0, 2).map((t) => <ChipTag key={t} className="mb-raise mb-chip-rect" href={href({ name: 'tags', tag: t })}>{t}</ChipTag>)}
              {capture.tags.length > 2 && <ChipMeta title={capture.tags.slice(2).join(', ')}>+{capture.tags.length - 2}</ChipMeta>}
            </span>
            <span className="mb-card-tasks-slot">{open > 0 && <ChipMeta tone="accent" className="mb-card-tasks">{tasks}</ChipMeta>}</span>
          </>
        )}
      </div>
    </Surface>
  );
}

import { AvatarStack } from '../Avatar/Avatar';
import { ChipMeta, ChipTag } from '../Chip/Chip';
import { Icon } from '../Icon/Icon';
import { PlayButton } from '../PlayButton/PlayButton';
import { Surface } from '../Surface/Surface';
import { Waveform } from '../Waveform/Waveform';
import { href } from '../../data/route';
import { formatDuration, formatWhen, isLowConfidence, isMeeting, openTasks, positionLabel, type Capture } from '../../data/model';
import './CaptureCard.css';

/**
 * A recording in a list (Figma page 07).
 *
 *   feed     Home — kind badge, title + time, type and tags, faces, the
 *            summary, then the player: play · waveform · length · tasks.
 *   meeting  the Meetings list — title (+ "1 voice to confirm"), date,
 *            who was there, tags, the player.
 *
 * The whole card is clickable (the title link stretches over it), while the
 * play button and tag links sit above it and do their own thing. One link
 * per card for a screen reader — not a card-sized button around its controls.
 */
export function CaptureCard(
  { capture, playing, progress, onPlay, variant = 'feed', linkTo, level = 3 }:
  {
    capture: Capture; playing: boolean; onPlay: () => void;
    progress?: { time: number; duration: number; line: number };
    variant?: 'feed' | 'meeting';
    /** Where the title goes. Defaults to the capture page. */
    linkTo?: string;
    /** Heading level of the title — under a day group (h2) it's 3; a flat list under the page's h1, 2. */
    level?: 2 | 3;
  },
) {
  const open = openTasks(capture);
  const meeting = isMeeting(capture) ? capture : undefined;
  /* While playing: live position. Otherwise: how far it was listened to. */
  const pct = progress && progress.duration ? (progress.time / progress.duration) * 100
    : capture.listenedTo && capture.durationSeconds ? Math.min(100, (capture.listenedTo / capture.durationSeconds) * 100) : 0;
  const where = progress
    ? `${positionLabel({ lineIndex: progress.line, totalLines: capture.lines.length })}, ${formatDuration(progress.time)}`
    : capture.listenedTo ? `Listened to ${formatDuration(capture.listenedTo)} of ${formatDuration(capture.durationSeconds)}` : 'Not started';
  const tasks = `${open} ${open === 1 ? 'task' : 'tasks'}`;
  const unsure = meeting ? meeting.speakers.filter((s) => !s.confirmed && meeting.lines.some((l) => l.speakerId === s.id && isLowConfidence(l, s))).length : 0;
  const tags = capture.tags.slice(0, 3);
  const H = level === 2 ? 'h2' : 'h3';

  return (
    <Surface as="article" className={`mb-card mb-stretch is-${variant}`}>
      <div className="mb-card-top">
        {variant === 'feed' && (
          <span className="mb-card-kind" aria-hidden="true"><Icon name={meeting ? 'users' : 'mic'} size={18} /></span>
        )}
        <div className="mb-card-titleblock">
          <div className="mb-card-titlerow">
            <H className="mb-t-heading mb-card-title">
              {/* The card's one link — stretched over the whole card (.mb-stretch). */}
              <a className="mb-stretch-link" href={linkTo ?? href({ name: 'capture', id: capture.id })}>{capture.title}</a>
            </H>
            {variant === 'meeting' && unsure > 0 && <ChipMeta tone="low-confidence">{unsure} {unsure === 1 ? 'voice' : 'voices'} to confirm</ChipMeta>}
            <span className="mb-t-meta mb-card-when">{formatWhen(capture.createdAt)}</span>
          </div>
          <div className="mb-card-meta">
            {variant === 'feed' ? (
              <span className="mb-t-meta mb-muted">{meeting ? 'Meeting' : 'Note'}</span>
            ) : meeting && (
              <span className="mb-t-body-sm mb-card-people">{meeting.attendees.join(', ')}</span>
            )}
            {variant === 'feed' && tags.length > 0 && <span className="mb-t-meta mb-card-sep" aria-hidden="true">·</span>}
            {variant === 'feed' && tags.map((t) => <ChipTag key={t} className="mb-raise" href={href({ name: 'tags', tag: t })}>{t}</ChipTag>)}
            {variant === 'feed' && capture.tags.length > 3 && <ChipMeta title={capture.tags.slice(3).join(', ')}>+{capture.tags.length - 3}</ChipMeta>}
            <span className="mb-card-flex" />
            {variant === 'meeting' && tags.map((t) => <ChipTag key={t} className="mb-raise" href={href({ name: 'tags', tag: t })}>{t}</ChipTag>)}
            {meeting && variant === 'feed' && <AvatarStack names={meeting.attendees} speakers={meeting.speakers} max={3} />}
          </div>
        </div>
      </div>

      {variant === 'feed' && capture.summary && <p className="mb-t-body mb-card-summary">{capture.summary}</p>}

      <div className="mb-card-foot">
        {capture.audio ? (
          <>
            <span className="mb-raise"><PlayButton size="xs" playing={playing} onClick={onPlay} label={`recording of ${capture.title}`} /></span>
            <Waveform peaks={capture.peaks} percent={pct} label={`Position in recording, ${capture.title}`} valueText={where} />
          </>
        ) : (
          <span className="mb-t-meta mb-muted mb-card-noaudio">No recording · transcript only</span>
        )}
        <span className="mb-t-meta mb-tabular mb-card-len">{formatDuration(capture.durationSeconds)}</span>
        {open > 0 && <ChipMeta tone="accent" className="mb-card-tasks"><Icon name="check" size={12} /> {tasks}</ChipMeta>}
      </div>
    </Surface>
  );
}

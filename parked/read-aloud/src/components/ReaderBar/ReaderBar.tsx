import { useEffect, useRef, useState } from 'react';
import { Button } from '../Button/Button';
import { PlayButton } from '../PlayButton/PlayButton';
import { Segmented } from '../Segmented/Segmented';
import { Track } from '../Track/Track';
import { positionLabel, readPercent } from '../../data/model';
import { READ_RATES, type ReadRate } from '../../data/store';
import type { ReadAloud } from '../../readAloud/useReadAloud';
import type { NaturalStatus } from '../../readAloud/natural/NaturalVoice';
import { mb } from '../../readAloud/natural/useNaturalStatus';
import './ReaderBar.css';

/**
 * The read-aloud bar (Figma decision #9 — "design it properly").
 *
 * ⭐ The position is stated as "Line 4 of 18", large, in words. Not a
 * timestamp, not only a bar. Someone listening because reading is hard needs
 * to know where they are IN THE TEXT, so they can look down and find it.
 *
 * Previous / next move by LINE — the unit the reader thinks in — rather than
 * skipping ten seconds of audio that may land mid-word.
 */
export function ReaderBar(
  { ra, rate, onRate, title, available, natural }:
  {
    ra: ReadAloud; rate: ReadRate; onRate: (r: ReadRate) => void; title: string; available: boolean;
    /** Present when the natural voice is the chosen engine. */
    natural?: NaturalStatus;
  },
) {
  const pos = { lineIndex: ra.index, totalLines: ra.total };
  const label = positionLabel(pos);
  const announcement = useAnnouncement(ra, label, available, natural);
  const none = ra.total === 0;

  return (
    <section className="mb-reader" aria-label="Read aloud">
      <PlayButton size="lg" playing={ra.playing} onClick={ra.toggle} label={`${title} aloud`} disabled={!available || none} keyshortcuts="Space" />
      <div className="mb-reader-main">
        <div className="mb-reader-row">
          <span className="mb-label-strong mb-tabular mb-reader-pos">{label}</span>
          <span className={`mb-meta mb-reader-state${ra.error ? ' is-error' : ''}`}>
            {stateText(ra, available, natural)}
          </span>
        </div>
        {/* What a screen reader hears — deliberately LESS than what's shown.
            Not every line change: that talked over the voice itself on every
            line. Only a move the user made while paused, a wait (so pressing
            play isn't met with silence), and a failure. */}
        <span className="mb-sr-only" role="status" aria-live="polite">{announcement}</span>
        <Track percent={readPercent(pos)} label="Read-aloud position" valueText={label} />
        <p className="mb-meta mb-muted mb-reader-keys" aria-hidden="true">
          <kbd>Space</kbd> play / pause · <kbd>←</kbd> <kbd>→</kbd> previous / next line
        </p>
      </div>
      <div className="mb-reader-controls">
        <Button variant="ghost" size="sm" icon="prev" aria-label="Previous line" aria-keyshortcuts="ArrowLeft" onClick={ra.prev} disabled={none || ra.index === 0} />
        <Button variant="ghost" size="sm" icon="next" aria-label="Next line" aria-keyshortcuts="ArrowRight" onClick={ra.next} disabled={none || ra.index >= ra.total - 1} />
        <Segmented
          size="sm" label="Reading speed" value={rate} onChange={onRate}
          options={READ_RATES.map((r) => ({ value: r, label: `${r}×` }))}
        />
      </div>
    </section>
  );
}

/**
 * What the voice is doing, in words. With the natural voice there are real
 * waits (the one-time download, the model waking up, a line being generated),
 * and a play button that shows "Reading aloud" while nothing is audible reads
 * as broken. So each wait is named.
 */
function stateText(ra: ReadAloud, available: boolean, natural?: NaturalStatus): string {
  if (!available) return 'Voice unavailable in this browser';
  if (ra.error) return ra.error;
  if (natural && ra.playing) {
    if (natural.phase === 'downloading') {
      return natural.totalBytes
        ? `Downloading natural voice · ${mb(natural.loadedBytes)} of ${mb(natural.totalBytes)}`
        : 'Downloading natural voice…';
    }
    if (natural.phase === 'preparing') return 'Waking the natural voice…';
    if (natural.waiting) return 'Preparing the next line…';
  }
  return ra.playing ? 'Reading aloud' : ra.finished ? 'Finished' : 'Paused';
}

function useAnnouncement(ra: ReadAloud, label: string, available: boolean, natural?: NaturalStatus): string {
  const [text, setText] = useState('');
  const lastIndex = useRef(ra.index);
  const lastWait = useRef('');
  const state = stateText(ra, available, natural);
  const isWait = !!ra.error || /^(Downloading|Waking|Preparing)/.test(state);
  /* Downloads tick every few KB; announce the PHASE, not each number. */
  const waitKey = ra.error ? `error:${ra.error}` : isWait ? state.replace(/ · .*/, '') : '';

  useEffect(() => {
    if (waitKey === lastWait.current) return;
    lastWait.current = waitKey;
    if (waitKey) setText(state);
  }, [waitKey, state]);

  useEffect(() => {
    if (lastIndex.current === ra.index) return;
    lastIndex.current = ra.index;
    if (!ra.playing) setText(label);
  }, [ra.index, ra.playing, label]);

  return text;
}

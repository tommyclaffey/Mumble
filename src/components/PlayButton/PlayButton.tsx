import { Icon } from '../Icon/Icon';
import './PlayButton.css';

/**
 * Play button — one component, two states, never two stacked instances.
 *
 * Defect from the Figma audit: three scripted checks passed a screen with two
 * play buttons stacked into a pill, because both were legitimate instances.
 * Here play and pause are ONE button whose icon and label swap. The label
 * carries the state ("Pause …"), so there's no aria-pressed as well — both
 * made a screen reader say "Pause X, toggle button, pressed".
 */
export function PlayButton(
  { playing, onClick, size = 'md', label, disabled, keyshortcuts }:
  { playing: boolean; onClick: () => void; size?: 'xs' | 'sm' | 'md' | 'lg'; label: string; disabled?: boolean; keyshortcuts?: string },
) {
  return (
    <button
      type="button"
      className={`mb-play is-${size}`}
      aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
      data-playing={playing}
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={keyshortcuts}
    >
      <Icon name={playing ? 'pause' : 'play'} size={size === 'lg' ? 24 : 16} />
    </button>
  );
}

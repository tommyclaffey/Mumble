import { Icon } from '../components/Icon/Icon';

/** Said once, plainly, instead of a play button that silently does nothing. */
export function SpeechUnavailable() {
  return (
    <div className="mb-notice" role="note" style={{ marginBottom: 'var(--space-16)' }}>
      <Icon name="speaker" size={20} />
      <p className="mb-body-reading">
        Read-aloud needs your browser’s speech voice, and this browser doesn’t offer one.
        Chrome, Edge and Safari all do.
      </p>
    </div>
  );
}

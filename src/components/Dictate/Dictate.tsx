import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { useServices } from '../../services';
import type { Recognizer } from '../../record/recognizer';
import './Dictate.css';

/**
 * Dictate — the mic beside a text field. Mumble is voice-first, so anything
 * you can type you can also say.
 *
 * Press it, speak, and the words go into the field (`onText`); it stops by
 * itself after the first phrase, or when pressed again. While listening the
 * words-so-far show under the field (`onInterim`) so you can see it's
 * working. Fields that hold a name or a search (tags, titles, people) get
 * the phrase without the full stop the recogniser adds (`plain`).
 *
 * Only one dictation runs at a time — starting another stops the first.
 * Where the browser can't dictate (no speech recognition, or an insecure
 * http page), the button isn't shown: a control that can't work isn't
 * offered. Record explains the http case in words.
 */
let stopActive: (() => void) | null = null;

export function DictateButton(
  { onText, onInterim, label, plain = false, size = 'md' }:
  { onText: (text: string) => void; onInterim?: (text: string) => void; label: string; plain?: boolean; size?: 'sm' | 'md' },
) {
  const { recognizer } = useServices();
  const rec = useRef<Recognizer | null>(null);
  if (!rec.current) rec.current = recognizer();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secure = typeof window === 'undefined' || window.isSecureContext !== false;

  function stop() {
    rec.current?.stop();
    setListening(false);
    onInterim?.('');
    if (stopActive === stop) stopActive = null;
  }
  useEffect(() => () => { if (stopActive) rec.current?.stop(); }, []);

  if (!rec.current.available || !secure) return null;

  function start() {
    stopActive?.();
    stopActive = stop;
    setError(null);
    setListening(true);
    rec.current!.start({
      onFinal: ({ text }) => {
        const t = plain ? text.replace(/[.!?]+$/, '') : text;
        onText(t);
        stop();
      },
      onInterim: (t) => onInterim?.(t),
      onError: (m) => { setError(m); stop(); },
    });
  }

  return (
    <span className="mb-dictate-wrap">
      <button
        type="button" className={`mb-dictate is-${size}${listening ? ' is-listening' : ''}`}
        aria-pressed={listening} aria-label={listening ? `Stop dictating` : label}
        title={listening ? 'Listening… press to stop' : label}
        onMouseDown={(e) => e.preventDefault() /* keep focus (and an open picker) on the field */}
        onClick={() => (listening ? stop() : start())}
      >
        <Icon name="mic" size={size === 'sm' ? 14 : 16} />
      </button>
      {error && <span className="mb-dictate-error" role="alert">{error}</span>}
    </span>
  );
}

/** The words heard so far, under a field, while dictating. */
export function Heard({ text }: { text: string }) {
  if (!text) return null;
  return <p className="mb-dictate-heard" aria-live="polite"><span className="mb-dictate-dot" aria-hidden="true" />{text}</p>;
}

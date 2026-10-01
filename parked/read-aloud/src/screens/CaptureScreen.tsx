import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, colorFor } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { ChipMeta } from '../components/Chip/Chip';
import { EditableTitle } from '../components/EditableTitle/EditableTitle';
import { TagEditor } from '../components/TagEditor/TagEditor';
import { Icon } from '../components/Icon/Icon';
import { ReaderBar } from '../components/ReaderBar/ReaderBar';
import { SpeakerFix } from '../components/SpeakerFix/SpeakerFix';
import { Surface } from '../components/Surface/Surface';
import { Toast, ToastRegion } from '../components/Toast/Toast';
import {
  correctSpeaker, formatDuration, formatWhen, isLowConfidence, isMeeting, linesBySpeaker,
  taskForLine, toMarkdown, turnsOf, wordCount, type Capture, type Task,
} from '../data/model';
import { go, href } from '../data/route';
import { useStore } from '../data/store';
import { useEngines } from '../readAloud/EngineContext';
import { useReadAloud } from '../readAloud/useReadAloud';
import { useNaturalStatus } from '../readAloud/natural/useNaturalStatus';
import './screens.css';
import './CaptureScreen.css';

/**
 * One capture — a note OR a meeting, on ONE screen with two states.
 *
 * (Phase 3 backlog, direction 1.) A note hides everything that only exists
 * when there are several people: speaker headers, attendees, the correction
 * flow, assignees other than you. The difference is a property of the
 * capture — the screen branches on `kind`, the compiler checks the branches.
 *
 * Two mechanisms mark a line, and they are deliberately different
 * (from the design system): a FILLED PILL marks an extracted task; a GUTTER
 * BAR marks the line being read aloud. A line can be both and stay legible.
 */
export function CaptureScreen({ id }: { id: string }) {
  const { capture } = useStore();
  const c = capture(id);
  if (!c) {
    return (
      <div className="mb-page">
        <h1 className="mb-display-page mb-page-title">Not found</h1>
        <div className="mb-empty">
          <p>That capture doesn’t exist any more.</p>
          <a href={href({ name: 'recent', filter: 'all' })}>Back to Recent</a>
        </div>
      </div>
    );
  }
  return <CaptureView key={c.id} c={c} />;
}

function CaptureView({ c }: { c: Capture }) {
  const { dispatch, prefs, captures } = useStore();
  const allTags = [...new Set(captures.flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b));
  const { speech, natural } = useEngines();
  const naturalStatus = useNaturalStatus(natural);
  const ra = useReadAloud(c.lines.map((l) => l.text), speech, prefs, c.id);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const lineRefs = useRef(new Map<number, HTMLElement>());
  const dismiss = useCallback(() => setToast(null), []);

  /* Keep the line being read on screen. `nearest` so it only scrolls when the
     line would otherwise leave the viewport — no jumping on every line. */
  useEffect(() => {
    if (!ra.playing) return;
    const el = lineRefs.current.get(ra.index);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }, [ra.index, ra.playing]);

  /* Keyboard: Space plays/pauses, ← → move by line. Only when focus isn't in
     something that already uses those keys (a text field, a select, a button
     or radio — Space activates a focused button, arrows move a radio group). */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      /* Fields and radio groups own every key. Buttons and links own Space
         (it activates them) but not the arrows — so after pressing Play,
         → still moves to the next line. */
      if (t?.closest('input, textarea, select, [role="radio"], [contenteditable="true"]')) return;
      if (e.key === ' ') {
        if (t?.closest('button, a')) return;
        e.preventDefault(); ra.toggle();
      }
      else if (e.key === 'ArrowRight') { e.preventDefault(); ra.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ra.prev(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ra]);

  function jumpTo(index: number) {
    ra.seek(index);
    const el = lineRefs.current.get(index);
    if (el) {
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      el.focus({ preventScroll: true });
    }
  }

  function onCorrect(speakerId: string, name: string) {
    if (!isMeeting(c)) return;
    const { meeting: after, linesChanged } = correctSpeaker(c, speakerId, name);
    if (linesChanged === 0) return;
    /* Remember only what the correction touches. */
    const speakers = c.speakers;
    const lineSpeakers = Object.fromEntries(c.lines.map((l) => [l.id, l.speakerId]));
    dispatch({ type: 'correctSpeaker', captureId: c.id, speakerId, name });
    /* Focus follows the fix. If the voice merged into an existing speaker,
       the old header is gone — land on the speaker it became. */
    const target = after.speakers.find((s) => s.name === name.trim())?.id ?? speakerId;
    focusSpeaker(target);
    setToast({
      message: `${name.trim()} · ${linesChanged} ${linesChanged === 1 ? 'line' : 'lines'} updated`,
      undo: () => {
        dispatch({ type: 'restoreSpeakers', captureId: c.id, speakers, lineSpeakers });
        focusSpeaker(speakerId);
      },
    });
  }

  /* After the re-render the corrected header exists; focus it then. Cancelled
     if the screen goes away first, so it can never grab focus on another page. */
  const focusFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(focusFrame.current), []);
  function focusSpeaker(id: string) {
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-speaker-trigger="${id}"]`)?.focus());
  }

  function setTask(t: Task, patch: Partial<Task>) {
    if (patch.status) dispatch({ type: 'setTaskStatus', captureId: c.id, taskId: t.id, status: patch.status });
    if ('assignee' in patch) {
      dispatch({
        type: 'replaceCapture',
        capture: { ...c, tasks: c.tasks.map((x) => (x.id === t.id ? { ...x, assignee: patch.assignee } : x)) },
      });
    }
  }

  function exportMarkdown() {
    const blob = new Blob([toMarkdown(c)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.title.replace(/[^\w\- ]+/g, '').trim() || 'mumble'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(toMarkdown(c));
      setToast({ message: 'Transcript copied' });
    } catch {
      setToast({ message: 'Couldn’t reach the clipboard — use Export instead' });
    }
  }

  function remove() {
    if (!window.confirm(`Delete “${c.title}”? This can’t be undone.`)) return;
    dispatch({ type: 'deleteCapture', captureId: c.id });
    go({ name: 'recent', filter: 'all' });
  }

  const meeting = isMeeting(c) ? c : undefined;
  const people = meeting ? meeting.attendees : ['You'];

  return (
    <div className="mb-page mb-capture">
      <a className="mb-back mb-label" href={href({ name: 'recent', filter: 'all' })}>
        <Icon name="arrow-left" size={16} /> Recent
      </a>

      <header className="mb-capture-head">
        <EditableTitle title={c.title} onRename={(title) => dispatch({ type: 'updateCapture', captureId: c.id, patch: { title } })} />
        <div className="mb-capture-meta">
          <ChipMeta>{meeting ? 'Meeting' : 'Note'}</ChipMeta>
          <ChipMeta>{formatWhen(c.createdAt)}</ChipMeta>
          <ChipMeta><span className="mb-tabular">{formatDuration(c.durationSeconds)}</span></ChipMeta>
        </div>
        {meeting && (
          <div className="mb-capture-attendees">
            <span className="mb-label-strong">Attendees</span>
            {meeting.attendees.map((a) => (
              /* Chip / Person: the face and the name, same colour as their lines. */
              <span key={a} className="mb-person">
                <Avatar name={a} colorIndex={colorFor(a, meeting.speakers)} size="sm" />
                <span className="mb-label">{a}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="mb-capture-grid">
        <div className="mb-capture-left">
          <ReaderBar
            ra={ra} title={c.title} available={speech.available}
            natural={prefs.engine === 'natural' ? naturalStatus : undefined}
            rate={prefs.rate} onRate={(rate) => dispatch({ type: 'setPrefs', prefs: { rate } })}
          />

          <section aria-labelledby="transcript-h" className="mb-transcript">
            <h2 id="transcript-h" className="mb-heading-section mb-section-title">Transcript</h2>
            {c.lines.length === 0 && <p className="mb-muted">No speech was captured.</p>}
            {turnsOf(c).map((turn, ti) => {
              const speaker = meeting && turn.speakerId ? meeting.speakers.find((s) => s.id === turn.speakerId) : undefined;
              const anyLow = turn.lines.some(({ line }) => isLowConfidence(line, speaker));
              return (
                <div key={ti} className="mb-turn">
                  {meeting && speaker && (
                    <SpeakerFix
                      speaker={speaker}
                      lineCount={linesBySpeaker(meeting, speaker.id)}
                      lowConfidence={anyLow}
                      startsAt={formatDuration(turn.lines[0].line.startsAt)}
                      suggestions={meeting.attendees}
                      onCorrect={(name) => onCorrect(speaker.id, name)}
                    />
                  )}
                  {turn.lines.map(({ line, index }) => {
                    const task = taskForLine(c, line.id);
                    const reading = index === ra.index && (ra.playing || ra.index > 0 || ra.finished);
                    return (
                      <div
                        key={line.id}
                        ref={(el) => { if (el) lineRefs.current.set(index, el); else lineRefs.current.delete(index); }}
                        tabIndex={-1}
                        className={`mb-line${reading ? ' is-reading' : ''}${task ? ' is-task' : ''}`}
                        aria-current={reading ? 'true' : undefined}
                      >
                        <p className="mb-body-reading mb-line-text">
                          {reading && ra.word ? <SpokenWord text={line.text} start={ra.word.start} end={ra.word.end} /> : line.text}
                        </p>
                        {task && <span className="mb-label mb-line-task">Task</span>}
                        <button
                          type="button" className="mb-line-play"
                          aria-label={`Read aloud from line ${index + 1}`}
                          /* Out of the Tab order: one stop per line put 12+ stops
                             between the reader and the tasks. Keyboard users have
                             ← → and Space; screen readers can still activate it. */
                          tabIndex={-1}
                          onClick={() => ra.play(index)}
                          disabled={!speech.available}
                        >
                          <Icon name="play" size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        </div>

        <aside className="mb-capture-side" aria-label="About this capture">
          <section aria-labelledby="tasks-h">
            <h2 id="tasks-h" className="mb-heading-section mb-section-title">
              Extracted tasks <ChipMeta>{c.tasks.length}</ChipMeta>
            </h2>
            <p className="mb-meta mb-muted mb-provenance">
              {c.source === 'demo' ? 'Found by the model' : 'Suggested by phrasing — no model in the browser demo'}
            </p>
            {c.tasks.length === 0 ? (
              <p className="mb-body mb-muted">No tasks in this one.</p>
            ) : (
              <ul className="mb-list">
                {c.tasks.map((t) => {
                  const idx = c.lines.findIndex((l) => l.id === t.sourceLineId);
                  return (
                    <li key={t.id}>
                      <Surface className="mb-task">
                        <Checkbox
                          label={`Done: ${t.text}`} checked={t.status === 'done'}
                          onChange={(done) => setTask(t, { status: done ? 'done' : 'todo' })}
                        />
                        <div className="mb-task-body">
                          <p className={`mb-body mb-task-text${t.status === 'done' ? ' is-done' : ''}`}>{t.text}</p>
                          <div className="mb-task-meta">
                            <label className="mb-sr-only" htmlFor={`as-${t.id}`}>Assignee for {t.text}</label>
                            <select
                              id={`as-${t.id}`}
                              className={`mb-chip is-action mb-select${t.assignee ? '' : ' is-empty'}`}
                              value={t.assignee ?? ''}
                              onChange={(e) => setTask(t, { assignee: e.target.value || undefined })}
                            >
                              <option value="">Unassigned</option>
                              {people.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                            {t.status === 'in-progress' && <ChipMeta tone="accent">In progress</ChipMeta>}
                            {idx >= 0 && (
                              <button type="button" className="mb-link-button mb-meta" onClick={() => jumpTo(idx)}>
                                Line {idx + 1}
                              </button>
                            )}
                          </div>
                        </div>
                      </Surface>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="tags-h">
            <h2 id="tags-h" className="mb-heading-section mb-section-title">Tags</h2>
            <TagEditor
              tags={c.tags} allTags={allTags}
              onChange={(tags) => dispatch({ type: 'updateCapture', captureId: c.id, patch: { tags } })}
            />
          </section>

          <section aria-labelledby="summary-h">
            <h2 id="summary-h" className="mb-heading-section mb-section-title">AI summary</h2>
            {c.summary ? (
              /* The AI surface is its own token — everything the model wrote
                 stays visually separable from everything the user said. */
              <Surface tone="ai" className="mb-summary">
                <p className="mb-body-reading" style={{ margin: 0 }}>{c.summary}</p>
              </Surface>
            ) : (
              <p className="mb-body-reading mb-muted">
                No summary. Summaries come from the model, and captures recorded in the browser demo don’t go to one.
              </p>
            )}
          </section>

          <section aria-labelledby="details-h">
            <h2 id="details-h" className="mb-heading-section mb-section-title">Session details</h2>
            <dl className="mb-details">
              <dt>Duration</dt><dd className="mb-tabular">{formatDuration(c.durationSeconds)}</dd>
              <dt>Words</dt><dd className="mb-tabular">{wordCount(c).toLocaleString()}</dd>
              <dt>Lines</dt><dd className="mb-tabular">{c.lines.length}</dd>
              {meeting && <><dt>Speakers</dt><dd>{meeting.speakers.map((s) => s.name).join(', ')}</dd></>}
              <dt>Source</dt><dd>{c.source === 'demo' ? 'Demo recording' : 'Recorded in this browser'}</dd>
            </dl>
          </section>

          <div className="mb-capture-actions">
            <Button icon="copy" onClick={copyTranscript}>Copy</Button>
            <Button variant="primary" icon="download" onClick={exportMarkdown}>Export .md</Button>
          </div>
          <Button variant="ghost" size="sm" onClick={remove}>Delete capture</Button>
        </aside>
      </div>

      <ToastRegion>{toast && <Toast message={toast.message} onUndo={toast.undo} onDismiss={dismiss} />}</ToastRegion>
    </div>
  );
}

/** Smooth scrolling only for people who haven't asked the OS to reduce motion. */
function scrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/**
 * The word being spoken, marked inside its line.
 *
 * A dyslexic reader following along loses the place WITHIN a line as easily
 * as between lines. The line has its gutter bar; the word gets a solid mark.
 * Only drawn when the voice reports word boundaries — never estimated.
 */
function SpokenWord({ text, start, end }: { text: string; start: number; end: number }) {
  if (start < 0 || end <= start || start >= text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark className="mb-word">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, colorFor } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { TitleBox } from '../components/TitleBox/TitleBox';
import { TagEditor } from '../components/TagEditor/TagEditor';
import { TaskCard } from '../components/TaskCard/TaskCard';
import { Icon } from '../components/Icon/Icon';
import { PlayerBar } from '../components/PlayerBar/PlayerBar';
import { SpeakerFix } from '../components/SpeakerFix/SpeakerFix';
import { Page, PanelCard } from '../components/Page/Page';
import { Toast, ToastRegion } from '../components/Toast/Toast';
import {
  correctSpeaker, formatDuration, formatWhen, isLowConfidence, isMeeting, linesBySpeaker,
  taskForLine, toMarkdown, turnsOf, wordCount, type Capture, type Task,
} from '../data/model';
import { go, href } from '../data/route';
import { useStore } from '../data/store';
import { usePlayer } from '../playback/usePlayer';
import { useServices } from '../services';
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
 * BAR marks the line being played. A line can be both and stay legible.
 *
 * Play plays the RECORDING — a capture is what was said; the transcript is
 * the dictation of it, following along.
 */
export function CaptureScreen({ id, line }: { id: string; line?: number }) {
  const { capture } = useStore();
  const c = capture(id);
  if (!c) {
    return (
      <Page title="Not found">
        <div className="mb-empty">
          <p>That capture doesn’t exist any more.</p>
          <a href={href({ name: 'recent', filter: 'all' })}>Back to Recent</a>
        </div>
      </Page>
    );
  }
  return <CaptureView key={c.id} c={c} startLine={line} />;
}

function CaptureView({ c, startLine }: { c: Capture; startLine?: number }) {
  const { dispatch, prefs, captures } = useStore();
  const allTags = [...new Set(captures.flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b));
  const { audioStore } = useServices();
  const player = usePlayer(c, prefs.speed);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const lineRefs = useRef(new Map<number, HTMLElement>());
  const dismiss = useCallback(() => setToast(null), []);

  /* Keep the line being played on screen. `nearest` so it only scrolls when
     the line would otherwise leave the viewport — no jumping on every line. */
  useEffect(() => {
    if (!player.playing) return;
    const el = lineRefs.current.get(player.line);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }, [player.line, player.playing]);

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
        e.preventDefault(); player.toggle();
      }
      else if (e.key === 'ArrowRight') { e.preventDefault(); player.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); player.prev(); }
    }
    if (!player.hasAudio || !prefs.shortcuts) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, prefs.shortcuts]);

  function jumpTo(index: number) {
    if (player.hasAudio) player.seekLine(index);
    const el = lineRefs.current.get(index);
    if (el) {
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      el.focus({ preventScroll: true });
    }
  }

  /* Opened from a task ("#/capture/c2?line=9"): land on that line. */
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !startLine) return;
    opened.current = true;
    const i = Math.min(startLine, c.lines.length) - 1;
    requestAnimationFrame(() => jumpTo(i));
  });

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
    const { status: _status, ...rest } = patch;
    if (Object.keys(rest).length) {
      dispatch({ type: 'replaceCapture', capture: { ...c, tasks: c.tasks.map((x) => (x.id === t.id ? { ...x, ...rest } : x)) } });
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

  /* Share: the system share sheet where there is one (phones, Safari),
     otherwise the link to this capture, copied. */
  async function share() {
    const url = location.href.split('?')[0];
    try {
      if (navigator.share) { await navigator.share({ title: c.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setToast({ message: 'Link copied' });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setToast({ message: 'Couldn’t share — use Export instead' });
    }
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
    /* The recording goes with it — nothing left behind in the browser. */
    if (c.audio === 'stored') void audioStore.remove(c.id);
    go({ name: 'recent', filter: 'all' });
  }

  const meeting = isMeeting(c) ? c : undefined;
  const people = meeting ? meeting.attendees : ['You'];
  /* Voices the model wasn't sure of — the header says how many, and takes
     you to the first one. */
  const unsure = meeting ? meeting.speakers.filter((s) => !s.confirmed && c.lines.some((l) => l.speakerId === s.id && isLowConfidence(l, s))) : [];
  const done = c.tasks.filter((t) => t.status === 'done').length;

  const panel = (
    <>
      <PanelCard id="summary-h" title="Summary" icon="sparkle" ai meta={c.summary ? 'Written by the model' : undefined}>
        {c.summary ? (
          /* The AI surface is its own token — everything the model wrote
             stays visually separable from everything the user said. */
          <p className="mb-t-body-sm">{c.summary}</p>
        ) : (
          <p className="mb-t-body-sm mb-muted">
            No summary. Summaries come from the model, and captures recorded in the browser demo don’t go to one.
          </p>
        )}
      </PanelCard>

      <PanelCard id="tasks-h" title="Tasks" icon="check" meta={c.tasks.length ? `${done} of ${c.tasks.length} done` : undefined}>
        <p className="mb-t-meta mb-muted mb-review-provenance">{c.source === 'demo' ? 'Found by the model' : 'Suggested by phrasing — no model in the browser demo'}</p>
        {c.tasks.length === 0 ? (
          <p className="mb-t-body-sm mb-muted">No tasks in this one.</p>
        ) : (
          <ul className="mb-prows">
            {c.tasks.map((t) => {
              const idx = c.lines.findIndex((l) => l.id === t.sourceLineId);
              return (
                <li key={t.id}>
                  <TaskCard
                    task={t} people={people}
                    at={idx >= 0 ? formatDuration(c.lines[idx].startsAt) : undefined}
                    onToggle={(d) => setTask(t, { status: d ? 'done' : 'todo' })}
                    onAssign={(who) => setTask(t, { assignee: who })}
                    onStatus={(status) => setTask(t, { status })}
                    onDue={(due) => setTask(t, { due })}
                    onJump={idx >= 0 ? () => jumpTo(idx) : undefined}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard id="details-h" title="Details" icon="info">
        <dl className="mb-pkv">
          <dt>Length</dt><dd className="mb-tabular">{formatDuration(c.durationSeconds)}</dd>
          <dt>Words</dt><dd className="mb-tabular">{wordCount(c).toLocaleString()}</dd>
          <dt>Speakers</dt><dd>{meeting ? `${meeting.speakers.length}${unsure.length ? ` · ${unsure.length} unconfirmed` : ''}` : 'You'}</dd>
          <dt>Source</dt><dd>{c.source === 'demo' ? 'Demo · synthetic voices' : c.audio ? 'Recorded in this browser' : 'Transcript only'}</dd>
          <dt>Stored</dt><dd>This browser only</dd>
        </dl>
        <Button variant="ghost" size="sm" icon="trash" onClick={remove}>Delete recording</Button>
      </PanelCard>
    </>
  );

  const head = (
    <>
      <div className="mb-note-top">
        <a className="mb-note-back" href={href({ name: 'recent', filter: 'all' })}><Icon name="arrow-left" size={16} /> Recent</a>
        <span className="mb-note-actions">
          <Button size="sm" icon="share" onClick={share}>Share</Button>
          <Button size="sm" icon="download" onClick={exportMarkdown}>Export .md</Button>
        </span>
      </div>
      {/* The page's heading is the capture's title, so a screen reader
          announces WHICH one opened; the big title is also the rename field. */}
      <h1 className="mb-sr-only">{c.title}</h1>
      <TitleBox title={c.title} onRename={(title) => dispatch({ type: 'updateCapture', captureId: c.id, patch: { title } })} />
      <p className="mb-t-body-sm mb-muted mb-note-meta">
        {meeting ? 'Meeting' : 'Note'} · {formatWhen(c.createdAt)} · <span className="mb-tabular">{formatDuration(c.durationSeconds)}</span> · {wordCount(c).toLocaleString()} words
      </p>
      <div className="mb-note-people">
        {meeting && (
          <div className="mb-note-attendees" aria-label="Meeting attendees" role="group">
            {meeting.attendees.map((a) => (
              <span key={a} className="mb-person">
                <Avatar name={a} colorIndex={colorFor(a, meeting.speakers)} size="sm" />
                <span>{a}</span>
              </span>
            ))}
            {unsure.length > 0 && (
              <button type="button" className="mb-chip is-meta is-low-confidence mb-note-unsure"
                onClick={() => {
                  /* Straight to the fix: the first unsure voice's question, opened. */
                  const who = document.querySelector<HTMLElement>(`[data-speaker-trigger="${unsure[0].id}"]`)?.closest('.mb-speaker')?.querySelector<HTMLButtonElement>('.mb-speaker-who');
                  who?.scrollIntoView?.({ block: 'center', behavior: scrollBehavior() });
                  who?.click();
                }}>
                {unsure.length} {unsure.length === 1 ? 'voice' : 'voices'} to confirm
              </button>
            )}
            <span className="mb-note-sep" aria-hidden="true" />
          </div>
        )}
        <TagEditor tags={c.tags} allTags={allTags} onChange={(tags) => dispatch({ type: 'updateCapture', captureId: c.id, patch: { tags } })} />
      </div>
      <hr className="mb-rule mb-note-rule" />
    </>
  );

  return (
    <Page head={head} panel={panel} panelLabel="About this capture">
      <div className="mb-note">
        <PlayerBar
          compact player={player} title={c.title} peaks={c.peaks}
          speed={prefs.speed} onSpeed={(speed) => dispatch({ type: 'setPrefs', prefs: { speed } })}
        />

        <section aria-label="Transcript lines" className="mb-transcript">
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
                    onPlay={player.hasAudio ? () => player.play(turn.lines[0].index) : undefined}
                  />
                )}
                {turn.lines.map(({ line, index }) => {
                  const task = taskForLine(c, line.id);
                  const current = player.hasAudio && player.started && index === player.line;
                  return (
                    <div
                      key={line.id}
                      ref={(el) => { if (el) lineRefs.current.set(index, el); else lineRefs.current.delete(index); }}
                      tabIndex={-1}
                      className={`mb-line${current ? ' is-current' : ''}${task ? ' is-task' : ''}${player.hasAudio ? ' is-playable' : ''}${meeting ? '' : ' is-note'}`}
                      aria-current={current ? 'true' : undefined}
                      /* Click a line to play from it — unless the click was
                         the end of selecting text to copy. */
                      onClick={player.hasAudio ? (e) => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        if (window.getSelection()?.toString()) return;
                        player.play(index);
                      } : undefined}
                    >
                      <p className="mb-t-reading mb-line-text">{line.text}</p>
                      {task && <span className="mb-chip is-tag mb-line-task"><Icon name="check" size={12} /> Task</span>}
                      {player.hasAudio && (
                        <button
                          type="button" className="mb-line-play"
                          aria-label={`Play from line ${index + 1}`}
                          /* Out of the Tab order: one stop per line put 12+ stops
                             between the player and the tasks. Keyboard users have
                             ← → and Space; screen readers can still activate it. */
                          tabIndex={-1}
                          onClick={() => player.play(index)}
                        >
                          <Icon name="play" size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>

        <div className="mb-review-foot">
          <button type="button" className="mb-icon-btn" onClick={copyTranscript} aria-label="Copy transcript"><Icon name="copy" size={16} /></button>
          <span className="mb-t-meta mb-muted">{c.source === 'demo' ? 'Demo recording' : 'Recorded in this browser'} · {formatWhen(c.createdAt)}</span>
        </div>
      </div>

      <ToastRegion>{toast && <Toast message={toast.message} onUndo={toast.undo} onDismiss={dismiss} />}</ToastRegion>
    </Page>
  );
}

/** Smooth scrolling only for people who haven't asked the OS to reduce motion. */
function scrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

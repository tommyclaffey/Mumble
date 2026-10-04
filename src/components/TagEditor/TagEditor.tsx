import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../Icon/Icon';
import { href } from '../../data/route';
import { useStore } from '../../data/store';
import { defaultTagColor, TAG_COLORS, tagColor, type TagColor } from '../../data/tagColor';
import './TagEditor.css';

/**
 * Tags on a recording — the tag pills, and a picker to add more.
 *
 *   · Each pill: its colour dot (press it to change the colour), the name (a
 *     link to the tag's page) and × to remove it from this recording.
 *   · "+ Add tag" opens a picker, not the browser's datalist: type to filter
 *     your existing tags (shown with their colours and how often they're
 *     used), ↑ ↓ to move, Enter to add. A name that doesn't exist yet becomes
 *     "Create …", with the colour chosen right there.
 *
 * Matching is case-insensitive and keeps the spelling already in use, so
 * "product" and "Product" never become two tags. The picker stays open after
 * adding, so several tags go on in one go; Escape or a click outside closes it.
 */
export function TagEditor(
  { tags, allTags, onChange }: { tags: string[]; allTags: string[]; onChange: (tags: string[]) => void },
) {
  const { captures, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [active, setActive] = useState(0);
  const [newColor, setNewColor] = useState<TagColor | null>(null);
  const [recolor, setRecolor] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const uid = useId();

  const q = value.trim().replace(/^#/, '');
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t.toLowerCase());
  const count = (t: string) => captures.filter((c) => c.tags.includes(t)).length;
  const options = allTags.filter((t) => !has(t) && t.toLowerCase().includes(q.toLowerCase()));
  const exact = allTags.find((t) => t.toLowerCase() === q.toLowerCase());
  const canCreate = !!q && !exact;
  /* Rows you can move through: the matches, then "Create …". */
  const rows = canCreate ? options.length + 1 : options.length;
  const createColor = newColor ?? defaultTagColor(q);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  /* A click anywhere else closes whatever is open. */
  useEffect(() => {
    if (!open && !recolor) return;
    function onDown(e: PointerEvent) { if (!root.current?.contains(e.target as Node)) { setOpen(false); setRecolor(null); setValue(''); } }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, recolor]);

  function close() { setOpen(false); setValue(''); requestAnimationFrame(() => addBtn.current?.focus()); }

  function add(name: string, color?: TagColor) {
    const canonical = allTags.find((t) => t.toLowerCase() === name.toLowerCase()) ?? name;
    if (color && !allTags.some((t) => t.toLowerCase() === canonical.toLowerCase())) dispatch({ type: 'setTagColor', tag: canonical, color });
    if (!has(canonical)) onChange([...tags, canonical]);
    setValue('');
    input.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (active < options.length && options.length) { add(options[active]); return; }
    if (q) add(exact ?? q, exact ? undefined : createColor);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown' && rows) { e.preventDefault(); setActive((a) => (a + 1) % rows); }
    else if (e.key === 'ArrowUp' && rows) { e.preventDefault(); setActive((a) => (a - 1 + rows) % rows); }
  }

  const optId = (i: number) => `${uid}-opt-${i}`;

  return (
    <div className="mb-tags" ref={root}>
      <div className="mb-tags-row">
        {tags.length > 0 && (
          <ul className="mb-tags-list">
            {tags.map((t) => (
              <li key={t} className="mb-tag-pill">
                <button
                  type="button" className="mb-tag-pill-dot" aria-expanded={recolor === t}
                  aria-label={`Colour of ${t}: ${tagColor(t)}. Change`}
                  onClick={() => setRecolor((r) => (r === t ? null : t))}
                >
                  <span className={`mb-tag-dot is-${tagColor(t)}`} aria-hidden="true" />
                </button>
                <a className="mb-tag-pill-link" href={href({ name: 'tags', tag: t })}>{t}</a>
                <button type="button" className="mb-tag-pill-remove" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
                  <Icon name="x" size={12} />
                </button>
                {recolor === t && (
                  <div className="mb-tag-pop mb-tag-pop-colors" role="dialog" aria-label={`Colour for ${t}`}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setRecolor(null); } }}>
                    <Swatches value={tagColor(t)} name={t} onPick={(c) => { dispatch({ type: 'setTagColor', tag: t, color: c }); setRecolor(null); }} />
                    <p className="mb-t-meta mb-muted">Changes {t} everywhere.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mb-tags-add-wrap">
          <button ref={addBtn} type="button" className="mb-tags-open" aria-expanded={open} aria-haspopup="dialog" onClick={() => (open ? close() : setOpen(true))}>
            <Icon name="plus" size={12} /> Add tag
          </button>

          {open && (
            <form className="mb-tag-pop mb-tag-picker" onSubmit={submit} onKeyDown={onKey} role="dialog" aria-label="Add a tag to this recording">
              <div className="mb-tag-search">
                <Icon name="hash" size={14} />
                <label htmlFor={`${uid}-in`} className="mb-sr-only">Add a tag</label>
                <input
                  ref={input} id={`${uid}-in`} value={value} onChange={(e) => { setValue(e.target.value); setActive(0); setNewColor(null); }}
                  placeholder="Find or create a tag" autoComplete="off" maxLength={32}
                  role="combobox" aria-expanded aria-controls={`${uid}-list`} aria-autocomplete="list"
                  aria-activedescendant={rows ? optId(active) : undefined}
                />
              </div>

              <ul className="mb-tag-options" id={`${uid}-list`} role="listbox" aria-label="Tags">
                {options.map((t, i) => (
                  <li
                    key={t} id={optId(i)} role="option" aria-selected={i === active}
                    className={`mb-tag-option${i === active ? ' is-active' : ''}`}
                    onPointerEnter={() => setActive(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => add(t)}
                  >
                    <span className={`mb-tag-dot is-${tagColor(t)}`} aria-hidden="true" />
                    <span className="mb-tag-option-name">{t}</span>
                    <span className="mb-t-meta mb-muted">{count(t)}</span>
                  </li>
                ))}
                {canCreate && (
                  <li
                    id={optId(options.length)} role="option" aria-selected={active === options.length}
                    className={`mb-tag-option is-create${active === options.length ? ' is-active' : ''}`}
                    onPointerEnter={() => setActive(options.length)} onPointerDown={(e) => e.preventDefault()} onClick={() => add(q, createColor)}
                  >
                    <Icon name="plus" size={14} />
                    <span className="mb-tag-option-name">Create <span className="mb-tag-preview"><span className={`mb-tag-dot is-${createColor}`} aria-hidden="true" />{q}</span></span>
                  </li>
                )}
                {!rows && (
                  <li className="mb-tag-empty mb-t-body-sm mb-muted" role="presentation">
                    {q ? `“${q}” is already on this recording.` : 'Type a name to create your first tag.'}
                  </li>
                )}
              </ul>

              {canCreate && (
                <div className="mb-tag-create">
                  <span className="mb-t-meta mb-muted">Colour</span>
                  <Swatches value={createColor} name={q} onPick={setNewColor} />
                </div>
              )}

              <p className="mb-tag-hint mb-t-meta mb-muted" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> add · <kbd>Esc</kbd> close</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Seven colour dots, as a radio group: arrow keys move, the label says the colour. */
function Swatches({ value, name, onPick }: { value: TagColor; name: string; onPick: (c: TagColor) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const n = (i + d + TAG_COLORS.length) % TAG_COLORS.length;
    onPick(TAG_COLORS[n].id);
    refs.current[n]?.focus();
  }
  return (
    <div className="mb-swatches" role="radiogroup" aria-label={`Colour for ${name || 'new tag'}`}>
      {TAG_COLORS.map((c, i) => (
        <button
          key={c.id} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={value === c.id}
          aria-label={c.label} tabIndex={value === c.id ? 0 : -1}
          className={`mb-swatch is-${c.id}`} onClick={() => onPick(c.id)} onKeyDown={(e) => onKey(e, i)}
        >
          {value === c.id && <Icon name="check" size={12} />}
        </button>
      ))}
    </div>
  );
}

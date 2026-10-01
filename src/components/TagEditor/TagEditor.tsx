import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../Icon/Icon';
import { href } from '../../data/route';
import './TagEditor.css';

/**
 * Tags on a capture: each links to its tag page, each can be removed, and a
 * new one can be added. Existing tags are suggested so "Product" and
 * "product" don't become two tags — matching is case-insensitive and keeps the
 * spelling already in use.
 */
export function TagEditor(
  { tags, allTags, onChange }: { tags: string[]; allTags: string[]; onChange: (tags: string[]) => void },
) {
  const [value, setValue] = useState('');
  /* Collapsed to the design's "+ Add" chip until it's wanted. */
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const listId = useId();
  useEffect(() => { if (adding) input.current?.focus(); }, [adding]);
  function close() { setAdding(false); setValue(''); requestAnimationFrame(() => addBtn.current?.focus()); }

  function add(e: FormEvent) {
    e.preventDefault();
    const raw = value.trim().replace(/^#/, '');
    if (!raw) return;
    const canonical = allTags.find((t) => t.toLowerCase() === raw.toLowerCase()) ?? raw;
    if (!tags.some((t) => t.toLowerCase() === canonical.toLowerCase())) onChange([...tags, canonical]);
    setValue('');
    input.current?.focus();
  }

  const suggestions = allTags.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  return (
    <div className="mb-tags">
      <div className="mb-tags-row">
      {tags.length > 0 && (
        <ul className="mb-tags-list">
          {tags.map((t) => (
            <li key={t} className="mb-tag-pill">
              <a className="mb-tag-pill-link" href={href({ name: 'tags', tag: t })}>{t}</a>
              <button type="button" className="mb-tag-pill-remove" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="mb-tags-add" onSubmit={add} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <label htmlFor={`${listId}-in`} className="mb-sr-only">Add a tag</label>
          <input
            ref={input} id={`${listId}-in`} list={listId} value={value} onChange={(e) => setValue(e.target.value)}
            onBlur={() => { if (!value.trim()) setAdding(false); }}
            placeholder="Tag name" autoComplete="off" maxLength={32}
          />
          <datalist id={listId}>{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
          <button type="submit" className="mb-tags-add-btn" disabled={!value.trim()} aria-label="Add tag">
            <Icon name="plus" size={16} />
          </button>
        </form>
      ) : (
        <button ref={addBtn} type="button" className="mb-chip is-action mb-tags-open" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Add tag
        </button>
      )}
      </div>
    </div>
  );
}

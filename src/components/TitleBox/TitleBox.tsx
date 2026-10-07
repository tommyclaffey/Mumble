import { useEffect, useState } from 'react';
import './TitleBox.css';
import { DictateButton } from '../Dictate/Dictate';

/**
 * The capture's title, in the design's title box (880 × 36, 6px corners) —
 * and that box IS the field: click, type, Enter or click away to save,
 * Escape to put it back. No separate "rename" mode to discover.
 */
export function TitleBox({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [value, setValue] = useState(title);
  useEffect(() => { setValue(title); }, [title]);

  function commit() {
    const t = value.trim();
    if (t && t !== title) onRename(t);
    else setValue(title);
  }

  return (
    <div className="mb-titlebox">
      <label htmlFor="title-input" className="mb-sr-only">Title</label>
      <input
        id="title-input" className="mb-titlebox-input" value={value} maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { e.stopPropagation(); setValue(title); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
        }}
      />
      <DictateButton label="Say a new title" plain onText={(t) => { setValue(t); if (t.trim() && t.trim() !== title) onRename(t.trim()); }} />
    </div>
  );
}

import type { ReactNode, Ref } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import './Page.css';

/**
 * The page every screen is: main content, and the side panel of stacked
 * cards on the right (the same on every screen — page 07 of the Figma file).
 *
 * The head is the page's one h1 and a line that says what's in it. Screens
 * with their own head (the note) pass `head` instead.
 */
export function Page(
  { title, subtitle, actions, head, panel, panelLabel, headingRef, headingId, children }:
  {
    title?: string; subtitle?: ReactNode; actions?: ReactNode; head?: ReactNode;
    panel?: ReactNode; panelLabel?: string;
    headingRef?: Ref<HTMLHeadingElement>; headingId?: string;
    children: ReactNode;
  },
) {
  return (
    <div className={`mb-layout${panel ? ' has-panel' : ''}`}>
      <div className="mb-layout-main">
        {head ?? (
          <div className="mb-pagehead">
            <div className="mb-pagehead-text">
              <h1 id={headingId} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="mb-t-page mb-pagehead-title">{title}</h1>
              {subtitle && <p className="mb-t-body-sm mb-pagehead-sub">{subtitle}</p>}
            </div>
            {actions && <div className="mb-pagehead-actions">{actions}</div>}
          </div>
        )}
        {children}
      </div>
      {panel && <aside className="mb-panel" aria-label={panelLabel}>{panel}</aside>}
    </div>
  );
}

/** A card in the side panel. `ai` puts it on the AI surface — model output only. */
export function PanelCard(
  { title, icon, meta, ai, children, id }:
  { title: string; icon?: IconName; meta?: ReactNode; ai?: boolean; children: ReactNode; id: string },
) {
  return (
    <section className={`mb-pcard${ai ? ' is-ai' : ''}`} aria-labelledby={id}>
      <div className="mb-pcard-head">
        {icon && <span className="mb-pcard-icon"><Icon name={icon} size={16} /></span>}
        <h2 id={id} className="mb-t-heading mb-pcard-title">{title}</h2>
        {meta !== undefined && <span className="mb-t-meta mb-pcard-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

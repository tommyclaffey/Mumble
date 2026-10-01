import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import './Button.css';

/**
 * Button.
 *
 *   primary    solid near-black — the one committing action on a screen (Stop, Save)
 *   secondary  card + border — everything else
 *   accent     the brand pill — Start Mumble, and nothing else
 *   ghost      no chrome — inline actions inside a surface
 *
 * Focus is drawn by :focus-visible, not a variant. The Figma decision (#1)
 * made focus a BOOLEAN because a button can be hovered and focused at once;
 * CSS gets that for free, since the two pseudo-classes compose.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  /** Icon-only buttons MUST name themselves. The type makes the label required. */
  children?: ReactNode;
  block?: boolean;
  /** React 19 passes ref as a plain prop; it lands on the <button> via ...rest. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'secondary', size = 'md', icon, children, block, className = '', type = 'button', ...rest
}: Props) {
  const iconOnly = !children;
  return (
    <button
      type={type}
      className={`mb-button is-${variant} is-${size}${iconOnly ? ' is-icon-only' : ''}${block ? ' is-block' : ''} ${className}`.trim()}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 20} />}
      {children}
    </button>
  );
}

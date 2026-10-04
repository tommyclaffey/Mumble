/**
 * The product's name — in ONE place.
 *
 * "Mumble" is the working name. As a real product it collides with Mumble AI
 * and Mumble Note (same category) and a registered MUMBLE software
 * trademark (Oct 4 2026 check — see the vault). Renaming means changing these
 * strings and swapping public/mumble-logo.png; nothing else says the name.
 */
export const BRAND = {
  name: 'Mumble',
  /** What one capture is called, in a sentence ("Saving your mumble"). */
  noun: 'mumble',
  /** The record action, everywhere it's offered. */
  startLabel: 'Start Mumble',
  /** A new recording's fallback title. */
  newTitle: 'New Mumble',
  logoAlt: 'Mumble — home',
} as const;

/**
 * The product's name — in ONE place.
 *
 * "Mumble" is the working name. As a real product it collides with Mumble AI
 * and Mumble Note, apps already using the name for the same job. (The MUMBLE
 * registration cited Oct 4, US 5847502, is for building panels and furniture,
 * and was cancelled Mar 20 2026: checked on the USPTO record Oct 10.)
 * Renaming means changing these
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

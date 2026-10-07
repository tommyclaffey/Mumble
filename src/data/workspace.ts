import { demoCaptures } from './demo';
import { isMeeting, type Capture } from './model';
import { teamCaptures } from './teamDemo';

/**
 * Workspaces — the personal demo, or the team demo.
 *
 *   personal  /Mumble/            just you. What the app has always been.
 *   team      /Mumble/team/       a made-up company, Harbor Labs: six people
 *                                 with faces and roles, and recordings your
 *                                 teammates made and shared.
 *
 * Which one is chosen by the address (?workspace=team — /team/ redirects
 * there), never by a switch inside the app: the team demo is a link you can
 * send someone, and a link has to open the same thing every time.
 *
 * Each workspace saves under its own key, so playing with the team demo never
 * touches your personal recordings.
 *
 * ⚠️ "You" stays "You" in the data. In the team demo, You is Jordan Ellis —
 * the face and name come from `me`, the recordings don't change.
 */
export type WorkspaceId = 'personal' | 'team';

export interface Person {
  name: string;
  role: string;
  /** File in public/people/. No photo → initials. */
  photo?: string;
  /** A guest's company. Guests are in meetings but not on the team. */
  company?: string;
}

export interface Workspace {
  id: WorkspaceId;
  name: string;
  storageKey: string;
  /** Who's signed in. The personal demo has no account, so no one. */
  me?: Person;
  /** The team, you first. Empty in the personal demo. */
  members: Person[];
  guests: Person[];
  captures: (now?: Date) => Capture[];
}

const PERSONAL: Workspace = {
  id: 'personal', name: 'Personal', storageKey: 'mumble.v1',
  members: [], guests: [], captures: demoCaptures,
};

const JORDAN: Person = { name: 'Jordan Ellis', role: 'Head of Product', photo: 'jordan.jpg' };
const TEAM: Workspace = {
  id: 'team', name: 'Harbor Labs', storageKey: 'mumble.team.v1',
  me: JORDAN,
  members: [
    JORDAN,
    { name: 'Maya Chen', role: 'Product Designer', photo: 'maya.jpg' },
    { name: 'Sarah Lee', role: 'Product Manager', photo: 'sarah.jpg' },
    { name: 'John Park', role: 'Engineering Lead', photo: 'john.jpg' },
    { name: 'Alex Rivera', role: 'Frontend Engineer', photo: 'alex.jpg' },
    { name: 'Nadia Haddad', role: 'UX Researcher', photo: 'nadia.jpg' },
  ],
  guests: [{ name: 'Dana Whitfield', role: 'Operations Director', company: 'Northbank', photo: 'dana.jpg' }],
  captures: teamCaptures,
};

const ALL: Record<WorkspaceId, Workspace> = { personal: PERSONAL, team: TEAM };

/** From the address: ?workspace=team (or ?team). Anything else is personal. */
export function workspaceFromSearch(search: string): WorkspaceId {
  const q = new URLSearchParams(search);
  return q.get('workspace') === 'team' || q.has('team') ? 'team' : 'personal';
}

/* Chosen once, at load — the address can't change it without a reload,
   because only the hash changes as you move around the app. */
let active: Workspace = ALL[typeof location === 'undefined' ? 'personal' : workspaceFromSearch(location.search)];

export function workspace(): Workspace { return active; }
export const isTeam = () => active.id === 'team';
/** Tests only. */
export function setWorkspace(id: WorkspaceId): void { active = ALL[id]; }

/** The link that opens a workspace, from wherever the app is served. */
export function workspaceHref(id: WorkspaceId): string {
  return `${import.meta.env.BASE_URL}${id === 'team' ? '?workspace=team' : ''}#/recent`;
}

/** The person behind a name as it appears in the data ("You" is `me`). */
export function personFor(name: string): Person | undefined {
  if (name === 'You') return active.me;
  return active.members.find((p) => p.name === name) ?? active.guests.find((p) => p.name === name);
}

export function photoFor(name: string): string | undefined {
  const file = personFor(name)?.photo;
  return file ? `${import.meta.env.BASE_URL}people/${file}` : undefined;
}

/** Same person? "You" and Jordan Ellis are, in the team demo. */
export function samePerson(a: string, b: string): boolean {
  if (a === b) return true;
  const me = active.me?.name;
  return !!me && ((a === 'You' && b === me) || (a === me && b === 'You'));
}

/**
 * Who a task on this recording can go to. Personal: whoever was in the
 * meeting (a note is just you). Team: the whole team as well — a task from
 * Maya's notes can be yours.
 */
export function assignable(c: Capture): string[] {
  const base = isMeeting(c) ? c.attendees : ['You'];
  if (!isTeam()) return base;
  const team = active.members.map((p) => (p.name === active.me?.name ? 'You' : p.name));
  return [...new Set([...base, ...team])];
}

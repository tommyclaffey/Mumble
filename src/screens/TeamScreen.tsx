import { BRAND } from '../brand';
import { Avatar, colorFor } from '../components/Avatar/Avatar';
import { ChipMeta } from '../components/Chip/Chip';
import { Page, PanelCard } from '../components/Page/Page';
import { Surface } from '../components/Surface/Surface';
import { formatWhen, isMeeting, type Capture } from '../data/model';
import { href } from '../data/route';
import { useStore } from '../data/store';
import { isTeam, samePerson, workspace, workspaceHref, type Person } from '../data/workspace';
import './screens.css';
import '../components/Button/Button.css';
import './TeamScreen.css';

/**
 * Team — who's in the workspace (team demo only).
 *
 * A card per person: face, name, role, and what they've done here — what
 * they recorded, the meetings they were in, the tasks they still own — with a
 * link to the latest recording they're part of. Every number is counted from
 * the recordings, not typed in, so ticking a task changes it.
 *
 * The personal demo has no team: it says so, and links to the one that does.
 */
export function TeamScreen() {
  const { captures } = useStore();
  const ws = workspace();

  if (!isTeam()) {
    return (
      <Page title="Team" subtitle="The personal demo is just you.">
        <div className="mb-empty">
          <p>See {BRAND.name} with a team: six people with faces and roles, recordings they shared, tasks with owners.</p>
          <p><a className="mb-button is-md is-primary" href={workspaceHref('team')}>Open the team demo</a></p>
        </div>
      </Page>
    );
  }

  /* "You" in the data is the signed-in person. */
  const key = (p: Person) => (p.name === ws.me?.name ? 'You' : p.name);
  const meetings = captures.filter(isMeeting);
  const statsFor = (p: Person) => {
    const k = key(p);
    const recorded = captures.filter((c) => samePerson(c.recordedBy ?? 'You', k));
    const inMeetings = meetings.filter((m) => m.attendees.some((a) => samePerson(a, k)));
    const open = captures.flatMap((c) => c.tasks).filter((t) => t.assignee && samePerson(t.assignee, k) && t.status !== 'done').length;
    const latest = [...new Set<Capture>([...recorded, ...inMeetings])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { recorded: recorded.length, meetings: inMeetings.length, open, latest };
  };
  const shared = captures.filter((c) => c.recordedBy && !samePerson(c.recordedBy, 'You')).length;

  const panel = (
    <>
      <PanelCard id="ws-h" title="Workspace" icon="users" meta="Demo">
        <dl className="mb-pkv">
          <dt>Name</dt><dd>{ws.name}</dd>
          <dt>Members</dt><dd className="mb-tabular">{ws.members.length}</dd>
          <dt>Recordings</dt><dd className="mb-tabular">{captures.length}</dd>
          <dt>Shared by teammates</dt><dd className="mb-tabular">{shared}</dd>
          <dt>Signed in as</dt><dd>{ws.me?.name}</dd>
        </dl>
      </PanelCard>
      {ws.guests.length > 0 && (
        <PanelCard id="guests-h" title="Guests" icon="user" meta={ws.guests.length}>
          <p className="mb-t-meta mb-muted mb-team-note">In your meetings, not on the team.</p>
          <ul className="mb-prows">
            {ws.guests.map((g) => (
              <li key={g.name} className="mb-team-guest">
                <Avatar name={g.name} colorIndex={colorFor(g.name)} size="lg" />
                <div className="mb-prow-text">
                  <span className="mb-t-body-sm mb-team-strong">{g.name}</span>
                  <span className="mb-t-meta mb-muted">{g.role} · {g.company}</span>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
      <PanelCard id="demo-h" title="About this demo" icon="info">
        <p className="mb-t-body-sm mb-muted">Everyone in {ws.name} is made up. Names, roles and recordings are fiction; the photos are stock portraits from Unsplash, and the voices are synthetic.</p>
        <p className="mb-t-body-sm mb-team-switch"><a className="mb-prow-link" href={workspaceHref('personal')}>Back to the personal demo</a></p>
      </PanelCard>
    </>
  );

  return (
    <Page title="Team" subtitle={`${ws.name} · ${ws.members.length} people`} panel={panel} panelLabel="About the workspace">
      <ul className="mb-team" aria-label="Team members">
        {ws.members.map((p) => {
          const s = statsFor(p);
          const me = p.name === ws.me?.name;
          return (
            <li key={p.name}>
              <Surface as="article" className="mb-member">
                <div className="mb-member-top">
                  <Avatar name={key(p)} colorIndex={colorFor(p.name)} size="xl" />
                  <div className="mb-prow-text">
                    <h2 className="mb-t-heading mb-member-name">{p.name}{me && <ChipMeta tone="accent" className="mb-member-you">You</ChipMeta>}</h2>
                    <p className="mb-t-body-sm mb-muted mb-member-role">{p.role}</p>
                  </div>
                </div>
                <dl className="mb-pstats mb-member-stats">
                  <div><dt>Recorded</dt><dd className="mb-tabular">{s.recorded}</dd></div>
                  <div><dt>Meetings</dt><dd className="mb-tabular">{s.meetings}</dd></div>
                  <div><dt>Open tasks</dt><dd className="mb-tabular">{s.open}</dd></div>
                </dl>
                <p className="mb-t-meta mb-muted mb-member-latest">
                  {s.latest ? <>Latest: <a className="mb-prow-link" href={href({ name: 'capture', id: s.latest.id })}>{s.latest.title}</a> · {formatWhen(s.latest.createdAt)}</> : 'Not in any recordings yet'}
                </p>
              </Surface>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

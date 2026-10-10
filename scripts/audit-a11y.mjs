/**
 * Accessibility audit in a REAL browser — the check the unit tests can't do.
 *
 *   npm run dev            (in another terminal)
 *   npm run audit:a11y     [base url, default http://localhost:5173/Mumble/]
 *
 * Launches headless Chrome, visits every screen at desktop (1440) and phone
 * (390) width, and runs axe-core with WCAG 2.2 AA + best-practice rules.
 * Unlike the jsdom tests, this one measures colour contrast on real pixels —
 * it's how the John Park avatar (white on light blue, 2.81:1) was found.
 *
 * Exits 1 if anything fails, so it can gate a deploy later.
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173/Mumble/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 400);
const SCREENS = ['#/recent', '#/capture/c1', '#/capture/c2', '#/record', '#/tasks', '#/tags', '#/tags/Product', '#/meetings', '#/team', '#/settings'];
/* The team demo: npm run audit:a11y -- 'http://localhost:5173/Mumble/?workspace=team' */
const WIDTHS = [[1440, 900], [390, 844]];
const axeSrc = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const up = await fetch(BASE).then((r) => r.ok).catch(() => false);
if (!up) { console.error(`Nothing at ${BASE}. Start it with: npm run dev`); process.exit(2); }

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mumble-a11y-'))}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  target = await fetch(`http://127.0.0.1:${PORT}/json/new?${BASE}`, { method: 'PUT' }).then((r) => r.json()).catch(() => null);
}
if (!target) { chrome.kill(); console.error('Chrome did not start.'); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const waits = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waits.has(d.id)) { waits.get(d.id)(d); waits.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
/* MAC=1: audit as the Mac app's window sees it (desktop/): the bridge is
   there, and the recorder is mid-recording, so the Mac-only screen and the
   header timer are checked too. */
if (process.env.MAC) {
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.mumbleDesktop = { version: 'audit' }; window.__mumbleMacState = { phase: 'recording', app: 'Zoom', since: Date.now() - 754000 };" });
  await send('Page.reload');
}
await sleep(1500);

let failures = 0;
/* A fresh browser gets the demo's welcome card first: audit it, then close
   it (Esc) so the screens behind it are audited too. */
{
  await sleep(800);
  const open = await send('Runtime.evaluate', { expression: "!!document.querySelector('[role=dialog]')", returnByValue: true });
  if (open.result.result.value) {
    await send('Runtime.evaluate', { expression: axeSrc });
    const r = await send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `axe.run(document.querySelector('[role=dialog]'), { runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice'], rules: { region: { enabled: false } } }).then(r => r.violations.map(v => v.id + ' (' + v.impact + '): ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(' | ')))`,
    });
    const v = r.result.result.value ?? ['axe did not run'];
    if (v.length) { failures += v.length; console.log('✗ welcome card'); v.forEach((x) => console.log('    ' + x)); } else console.log('✓ welcome card');
    /* Then the tour, from the card's "Take the tour": its first stop, audited, then ended. */
    await send('Runtime.evaluate', { expression: "[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Take the tour')?.click()" });
    await sleep(1500);
    const t = await send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `(() => { const c = document.querySelector('.mb-tour-card'); if (!c) return ['tour did not open']; return axe.run(c, { runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice'], rules: { region: { enabled: false } } }).then(r => r.violations.map(v => v.id + ' (' + v.impact + '): ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(' | '))); })()`,
    });
    const tv = t.result.result.value ?? ['axe did not run'];
    if (tv.length) { failures += tv.length; console.log('✗ tour'); tv.forEach((x) => console.log('    ' + x)); } else console.log('✓ tour');
    await send('Runtime.evaluate', { expression: "document.querySelector('.mb-tour-card')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))" });
    await sleep(400);
  }
}
for (const [w, h] of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  for (const hash of SCREENS) {
    await send('Runtime.evaluate', { expression: `location.hash=${JSON.stringify(hash)}` });
    await sleep(700);
    await send('Runtime.evaluate', { expression: axeSrc });
    const r = await send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice'] })
        .then(r => r.violations.map(v => v.id + ' (' + v.impact + '): ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')
          + (n.any[0]?.data?.contrastRatio ? ' [' + n.any[0].data.contrastRatio + ':1]' : '')).join(' | ')))`,
    });
    const v = r.result?.result?.value ?? ['(could not run)'];
    failures += v.length;
    console.log(`${v.length ? '✗' : '✓'} ${String(w).padStart(4)}px ${hash}${v.length ? '\n    ' + v.join('\n    ') : ''}`);
  }
}
ws.close(); chrome.kill();
console.log(failures ? `\n${failures} problem(s).` : '\nAll screens clean.');
process.exit(failures ? 1 : 0);

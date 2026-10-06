import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND } from '../src/brand';

/**
 * Installable (Oct 6). Keeps the pieces Chrome's install check needs, and
 * keeps the NAME in one place: brand.ts is where a rename happens, so the
 * home-screen name must follow it or this fails.
 */
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const html = readFileSync('index.html', 'utf8');
const sw = readFileSync('public/sw.js', 'utf8');

describe('the installable app', () => {
  it('⭐ the home-screen name IS the brand name -- a rename cannot miss it', () => {
    expect(manifest.short_name).toBe(BRAND.name);
    expect(manifest.name.startsWith(BRAND.name)).toBe(true);
    expect(html).toMatch(new RegExp(`apple-mobile-web-app-title" content="${BRAND.name}"`));
  });

  it('opens full screen, with relative paths that work at /Mumble/ and at /', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url.startsWith('./')).toBe(true);
    expect(manifest.scope).toBe('./');
    for (const i of manifest.icons) expect(existsSync(`public/${i.src}`), i.src).toBe(true);
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('⚠️ recordings are never cached by the worker -- they stay in IndexedDB', () => {
    const code = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/indexedDB|blob:/i);
    expect(sw).toMatch(/req\.mode === 'navigate'[\s\S]*fetch\(req\)[\s\S]*\.catch/);
  });
});

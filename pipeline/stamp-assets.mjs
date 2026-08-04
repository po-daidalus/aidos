// aidos.de — stamp a content hash onto every asset reference so a rebuild reaches browsers.
//
// WHY: the data files (aggregates.js, data.js, lookup.js …) are the whole point of this site and
// change with every sweep, but they were referenced unversioned and are served with
// `cache-control: public, max-age=14400`. A returning visitor therefore kept seeing the previous
// month's figures for up to four hours after a deploy — and the stylesheets had the same problem,
// patched by hand each time, which is exactly the kind of step that gets forgotten.
//
// The version is a hash of the file's own bytes: unchanged file → unchanged URL → cache still
// valid; changed file → new URL → fetched immediately. Runs at the end of pages.mjs so it cannot
// be skipped. Idempotent: an existing ?v= is replaced, so repeated runs are stable.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('dashboard/', ROOT);
const OUT_DIR = OUT.pathname;

// Everything whose content changes between builds and is referenced from HTML.
const ASSETS = ['aggregates.js', 'data.js', 'lookup.js', 'pagemap.js', 'articles.js', 'series.js', 'branch-icons.js', 'site.css', 'pages.css'];

const hashes = {};
for (const a of ASSETS) {
  const p = path.join(OUT_DIR, a);
  if (!fs.existsSync(p)) continue;
  hashes[a] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
}

const htmlFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(OUT_DIR);

// src="../aggregates.js?v=old"  /  href="site.css?v=old"  → same path with the current hash.
const names = Object.keys(hashes).map((n) => n.replace('.', '\\.')).join('|');
const re = new RegExp(`((?:src|href)=")([^"]*?)(${names})(\\?v=[^"]*)?(")`, 'g');

let touched = 0, refs = 0;
for (const f of htmlFiles) {
  const before = fs.readFileSync(f, 'utf8');
  const after = before.replace(re, (m, pre, dir, name, _old, post) => {
    refs++;
    return `${pre}${dir}${name}?v=${hashes[name]}${post}`;
  });
  if (after !== before) { fs.writeFileSync(f, after); touched++; }
}

console.log(`stamp-assets: ${refs} references in ${htmlFiles.length} files (${touched} rewritten) → ` +
  Object.entries(hashes).map(([n, h]) => `${n}:${h}`).join(' '));

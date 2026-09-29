#!/usr/bin/env node
// slugs.mjs — framework-slug parity between the plugin and the Qualflare CLI.
//
// The plugin's slug list lives in skills/qf-init/references/framework-slugs.md.
// The CLI's list has two independent sources of truth, and this script can read
// either one:
//
//   --go <models.go>          the Go source (qualflare-cli/internal/core/domain/models.go).
//                             Used by scripts/check-slugs.sh before a release.
//   --list-formats <file|->   the real stdout of `qf list-formats`, from a built CLI.
//                             Used by CI against a binary built from CLI main.
//
// Exit codes: 0 = the two sets are identical, 1 = drift (either direction),
// 2 = a source could not be parsed (e.g. zero slugs found). An EMPTY parse is an
// error, never a pass: the previous CI step grepped `^\s+[a-z]` against output
// whose every slug line is `  - <slug>`, matched nothing, and then compared an
// empty CLI list against the docs — which can never fail.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A slug is lowercase letters/digits with optional hyphens (`qualflare-json`).
// The old perl extraction used `\w+`, which silently skipped hyphenated slugs.
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

/** Parse `qf list-formats` stdout: every framework line is `  - <slug>`. */
export function parseListFormats(text) {
  const slugs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s+-\\s+(${SLUG})\\s*$`));
    if (m) slugs.push(m[1]);
  }
  return slugs;
}

/**
 * Parse the CLI's Go source. The authoritative list is AllFrameworks() —
 * Framework.IsValid() (what `--format` validation uses) iterates exactly that
 * slice — so each identifier listed there is resolved through its
 * `FrameworkX Framework = "slug"` constant. A constant that is declared but
 * missing from AllFrameworks(), or an AllFrameworks() entry with no constant,
 * is reported as an error rather than guessed at.
 */
export function parseGoSource(src) {
  const constants = new Map();
  const constRe = /^\s*(Framework\w+)\s+Framework\s*=\s*"([^"]*)"/gm;
  for (const m of src.matchAll(constRe)) constants.set(m[1], m[2]);

  const body = src.match(/func\s+AllFrameworks\s*\(\s*\)\s*\[\]Framework\s*\{[\s\S]*?return\s+\[\]Framework\s*\{([\s\S]*?)\}/);
  const errors = [];
  if (!body) {
    errors.push('could not find `func AllFrameworks() []Framework { return []Framework{...} }`');
    return { slugs: [], errors };
  }
  const idents = [...body[1].replace(/\/\/.*$/gm, '').matchAll(/\b(Framework\w+)\b/g)].map((m) => m[1]);

  const slugs = [];
  for (const id of idents) {
    if (!constants.has(id)) {
      errors.push(`AllFrameworks() lists ${id}, but no \`${id} Framework = "..."\` constant was found`);
      continue;
    }
    const slug = constants.get(id);
    if (!new RegExp(`^${SLUG}$`).test(slug)) {
      errors.push(`${id} has slug "${slug}", which is not a lowercase [a-z0-9-] slug this checker understands`);
      continue;
    }
    slugs.push(slug);
  }
  for (const id of constants.keys()) {
    if (!idents.includes(id)) errors.push(`${id} is declared but not returned by AllFrameworks()`);
  }
  return { slugs, errors };
}

/** Rows of the markdown table under the given `## heading`, first column only. */
function tableFirstColumn(md, heading) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return null;
  const out = [];
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s/.test(l)) break;
    if (!l.trim().startsWith('|')) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    const cell = l.split('|')[1].trim();
    if (/^-+$/.test(cell.replace(/:/g, '')) || cell === 'Slug') continue;
    out.push(cell);
  }
  return out;
}

/**
 * Parse framework-slugs.md. Only the first column of the "Slug Reference Table"
 * counts — not every backticked word in the file, which also names tools like
 * `pytest` and `webdriver`. The "Test-File Globs Per Slug" table must list the
 * same set, because /qf-update and /qf-doctor glob by it.
 */
export function parseSlugsMarkdown(md) {
  const errors = [];
  const cellToSlug = (cell, table) => {
    const m = cell.match(new RegExp(`^\`(${SLUG})\`$`));
    if (!m) errors.push(`${table}: first column "${cell}" is not a single backticked slug`);
    return m ? m[1] : null;
  };
  const refCells = tableFirstColumn(md, 'Slug Reference Table');
  const globCells = tableFirstColumn(md, 'Test-File Globs Per Slug');
  if (refCells === null) errors.push('missing "## Slug Reference Table" section');
  if (globCells === null) errors.push('missing "## Test-File Globs Per Slug" section');
  const slugs = (refCells ?? []).map((c) => cellToSlug(c, 'Slug Reference Table')).filter(Boolean);
  const globSlugs = (globCells ?? []).map((c) => cellToSlug(c, 'Test-File Globs Per Slug')).filter(Boolean);

  for (const [name, list] of [['Slug Reference Table', slugs], ['Test-File Globs Per Slug', globSlugs]]) {
    const seen = new Set();
    for (const s of list) {
      if (seen.has(s)) errors.push(`${name}: \`${s}\` is listed twice`);
      seen.add(s);
    }
  }
  if (refCells !== null && globCells !== null) {
    for (const s of slugs) if (!globSlugs.includes(s)) errors.push(`\`${s}\` is in the Slug Reference Table but has no row in Test-File Globs Per Slug`);
    for (const s of globSlugs) if (!slugs.includes(s)) errors.push(`\`${s}\` has a glob row but is not in the Slug Reference Table`);
  }
  return { slugs, errors };
}

/** Set difference both ways. */
export function diffSlugs(cliSlugs, docSlugs) {
  const cli = new Set(cliSlugs);
  const doc = new Set(docSlugs);
  return {
    missingInDocs: [...cli].filter((s) => !doc.has(s)).sort(),
    missingInCli: [...doc].filter((s) => !cli.has(s)).sort(),
  };
}

/** Returns { code, out, err } so tests can drive it without spawning. */
export function run(argv, { readFile = (p) => readFileSync(p === '-' ? 0 : p, 'utf8') } = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let docPath = path.join(here, '..', 'skills', 'qf-init', 'references', 'framework-slugs.md');
  let goPath = null;
  let lfPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--go') goPath = argv[++i];
    else if (a === '--list-formats') lfPath = argv[++i];
    else if (a === '--docs') docPath = argv[++i];
    else return { code: 2, out: '', err: `unknown argument: ${a}\n` };
  }
  if ((goPath === null) === (lfPath === null)) {
    return { code: 2, out: '', err: 'usage: slugs.mjs (--go <models.go> | --list-formats <file|->) [--docs <framework-slugs.md>]\n' };
  }

  let err = '';
  let cliSlugs;
  let source;
  if (goPath !== null) {
    source = goPath;
    const r = parseGoSource(readFile(goPath));
    if (r.errors.length) err += r.errors.map((e) => `ERROR: ${goPath}: ${e}\n`).join('');
    cliSlugs = r.slugs;
  } else {
    source = lfPath === '-' ? '`qf list-formats` (stdin)' : lfPath;
    cliSlugs = parseListFormats(readFile(lfPath));
  }
  if (cliSlugs.length === 0) {
    return { code: 2, out: '', err: `${err}ERROR: no slugs parsed from ${source} — the parser no longer matches its format\n` };
  }
  if (err) return { code: 2, out: '', err };

  const docs = parseSlugsMarkdown(readFile(docPath));
  if (docs.errors.length) {
    return { code: 1, out: '', err: docs.errors.map((e) => `ERROR: ${docPath}: ${e}\n`).join('') };
  }
  if (docs.slugs.length === 0) {
    return { code: 2, out: '', err: `ERROR: no slugs parsed from ${docPath}\n` };
  }

  const { missingInDocs, missingInCli } = diffSlugs(cliSlugs, docs.slugs);
  if (missingInDocs.length || missingInCli.length) {
    if (missingInDocs.length) {
      err += `ERROR: CLI slug(s) missing from framework-slugs.md:\n${missingInDocs.map((s) => `  - ${s}\n`).join('')}`;
    }
    if (missingInCli.length) {
      err += `ERROR: framework-slugs.md slug(s) the CLI does not accept (renamed or removed?):\n${missingInCli.map((s) => `  - ${s}\n`).join('')}`;
    }
    return { code: 1, out: '', err };
  }
  return { code: 0, out: `OK: all ${cliSlugs.length} CLI slugs match framework-slugs.md (source: ${source})\n`, err: '' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = run(process.argv.slice(2));
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exit(r.code);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseListFormats, parseGoSource, parseSlugsMarkdown, run } from './slugs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REAL_DOCS = path.join(here, '..', 'skills', 'qf-init', 'references', 'framework-slugs.md');
// Captured stdout of `qf list-formats` built from qualflare-cli main (2026-09-30).
// A parser fixture only — CI compares against a freshly built binary, not this file.
const LIST_FORMATS = readFileSync(path.join(here, 'fixtures', 'list-formats.txt'), 'utf8');

/** run() with in-memory files instead of the filesystem. */
function runWith(files, argv) {
  return run(argv, {
    readFile: (p) => {
      if (!(p in files)) throw new Error(`unexpected read: ${p}`);
      return files[p];
    },
  });
}

const DOCS = (slugs, globSlugs = slugs) => `# x

## Slug Reference Table

| Slug | Category | Common indicators | Notes |
|------|----------|-------------------|-------|
${slugs.map((s) => `| \`${s}\` | c | \`pytest\` \`webdriver\` | n |`).join('\n')}

---

## Test-File Globs Per Slug

| Slug | Glob patterns |
|------|---------------|
${globSlugs.map((s) => `| \`${s}\` | \`**/*\` |`).join('\n')}

---

## Extras: Commonly Detected But Not Qualflare Slugs

| Detected tool | Action |
|---------------|--------|
| **cargo-test** | none |
`;

const GO = (consts, all = consts.map(([id]) => id)) => `package domain
const (
${consts.map(([id, slug]) => `\t${id} Framework = "${slug}"`).join('\n')}
)
func AllFrameworks() []Framework {
\treturn []Framework{
${all.map((id) => `\t\t${id},`).join('\n')}
\t}
}
`;

test('parseListFormats reads the real `  - <slug>` lines, hyphenated slugs included', () => {
  const slugs = parseListFormats(LIST_FORMATS);
  assert.equal(slugs.length, 30);
  assert.ok(slugs.includes('qualflare-json'));
  assert.ok(slugs.includes('vitest'));
  assert.ok(!slugs.some((s) => /testing|generic|bdd/i.test(s)), 'category headers must not be read as slugs');
});

test('the pre-fix CI grep matched nothing in real output (the vacuous-pass defect)', () => {
  // ci.yml used: grep -E '^\s+[a-z]' | awk '{print $1}'
  const old = LIST_FORMATS.split('\n').filter((l) => /^\s+[a-z]/.test(l));
  assert.deepEqual(old, []);
});

test('empty list-formats output is an error, not a pass', () => {
  const r = runWith({ lf: '\nUnit Testing:\n\n', docs: DOCS(['jest']) }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 2);
  assert.match(r.err, /no slugs parsed/);
});

test('list-formats parity passes when the docs match the real CLI output', () => {
  const r = runWith({ lf: LIST_FORMATS, docs: DOCS(parseListFormats(LIST_FORMATS)) }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /all 30 CLI slugs match/);
});

test('a CLI slug missing from the docs fails', () => {
  const docs = DOCS(parseListFormats(LIST_FORMATS).filter((s) => s !== 'qualflare-json'));
  const r = runWith({ lf: LIST_FORMATS, docs }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 1);
  assert.match(r.err, /missing from framework-slugs\.md:\n {2}- qualflare-json\n/);
});

test('a docs slug the CLI does not accept fails (not merely a warning)', () => {
  const docs = DOCS([...parseListFormats(LIST_FORMATS), 'nosuchslug']);
  const r = runWith({ lf: LIST_FORMATS, docs }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 1);
  assert.match(r.err, /does not accept[^\n]*:\n {2}- nosuchslug\n/);
});

test('backticked tool names outside the first column are not slugs', () => {
  const { slugs } = parseSlugsMarkdown(DOCS(['jest', 'python']));
  assert.deepEqual(slugs, ['jest', 'python']);
});

test('a slug missing from the globs table fails', () => {
  const r = runWith({ lf: '  - jest\n  - python\n', docs: DOCS(['jest', 'python'], ['jest']) }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 1);
  assert.match(r.err, /`python` is in the Slug Reference Table but has no row in Test-File Globs/);
});

test('parseGoSource reads AllFrameworks() and keeps hyphenated slugs', () => {
  const r = parseGoSource(GO([['FrameworkJest', 'jest'], ['FrameworkQualflareJSON', 'qualflare-json']]));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.slugs, ['jest', 'qualflare-json']);
});

test('parseGoSource reports a constant that AllFrameworks() leaves out', () => {
  const r = parseGoSource(GO([['FrameworkJest', 'jest'], ['FrameworkNew', 'new']], ['FrameworkJest']));
  assert.match(r.errors.join('\n'), /FrameworkNew is declared but not returned by AllFrameworks/);
});

test('--go fails when the Go source has a slug the docs lack', () => {
  const go = GO([['FrameworkJest', 'jest'], ['FrameworkQualflareJSON', 'qualflare-json']]);
  const r = runWith({ go, docs: DOCS(['jest']) }, ['--go', 'go', '--docs', 'docs']);
  assert.equal(r.code, 1);
  assert.match(r.err, /- qualflare-json/);
});

test('the shipped framework-slugs.md is well-formed and matches the captured CLI output', () => {
  const r = runWith({ lf: LIST_FORMATS, docs: readFileSync(REAL_DOCS, 'utf8') }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 0, r.err);
});

// Against the real CLI source when a checkout is available (QF_CLI_DIR, or the
// Astrais monorepo sibling). CI sets QF_CLI_DIR; elsewhere this skips.
const cliDir = process.env.QF_CLI_DIR;
const goFile = cliDir && path.join(cliDir, 'internal', 'core', 'domain', 'models.go');
test('check-slugs.sh passes against the real CLI source', { skip: !(goFile && existsSync(goFile)) && 'QF_CLI_DIR not set' }, () => {
  const r = spawnSync('bash', [path.join(here, 'check-slugs.sh')], { encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0, r.stderr);
});

// /qf-run, /qf-fix and /qf-doctor have no `vitest` row: Vitest must be recorded as
// `jest`. The qf-init subagent is told to use ONLY slugs from framework-slugs.md, so
// the rule has to be where the subagent reads — its brief and the vitest row — not
// only in the orchestrator's edge-case list.
test('the qf-init subagent is told to record Vitest as jest, in its brief and on the vitest row', () => {
  const skill = readFileSync(path.join(here, '..', 'skills', 'qf-init', 'SKILL.md'), 'utf8');
  const brief = skill.split('\n').filter((l) => l.startsWith('>')).join('\n');
  assert.match(brief, /Use ONLY slugs from that list[^\n]*Vitest[^\n]*under `jest`, never `vitest`/);
  const row = readFileSync(REAL_DOCS, 'utf8').split('\n').find((l) => l.startsWith('| `vitest` |'));
  assert.ok(row, 'framework-slugs.md has a `vitest` row');
  assert.match(row, /Detect as `jest`/);
});

// /qf-update and /qf-init pass the glob cell straight to Glob; prose there is
// globbed literally and counts nothing.
test('globCellError accepts backticked globs and the skip marker, rejects prose', async () => {
  const { globCellError, SKIP_COUNTING } = await import('./slugs.mjs');
  assert.equal(globCellError('`**/*_test.go`'), null);
  assert.equal(globCellError('`tests/**/test_*.py`, `**/*_test.py`'), null);
  assert.equal(globCellError(SKIP_COUNTING), null);
  assert.ok(globCellError("*(the Qualflare reporter's configured `outputDir`)*"));
  assert.ok(globCellError('*(varies by language)*'));
  assert.ok(globCellError('`**/*.feature` (co-located with `src/test/`)'));
  assert.ok(globCellError('`a b`'));
  assert.ok(globCellError(''));
});

test('a prose glob cell fails the docs check', () => {
  const docs = DOCS(['jest', 'qualflare-json']).replace("| `qualflare-json` | `**/*` |", "| `qualflare-json` | *(the reporter's `outputDir`)* |");
  const r = runWith({ lf: '  - jest\n  - qualflare-json\n', docs }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 1);
  assert.match(r.err, /Test-File Globs Per Slug: `qualflare-json`: .* neither a comma-separated list of backticked globs/);
});

test('the skip-counting marker passes the docs check', () => {
  const docs = DOCS(['jest', 'qualflare-json']).replace("| `qualflare-json` | `**/*` |", '| `qualflare-json` | *(skip counting)* |');
  const r = runWith({ lf: '  - jest\n  - qualflare-json\n', docs }, ['--list-formats', 'lf', '--docs', 'docs']);
  assert.equal(r.code, 0, r.err);
});

test('every skill that globs by the slug table skips the skip-counting marker', () => {
  for (const s of ['qf-init', 'qf-update', 'qf-doctor', 'qf-state']) {
    const md = readFileSync(path.join(here, '..', 'skills', s, 'SKILL.md'), 'utf8');
    assert.ok(md.includes('*(skip counting)*'), `${s}/SKILL.md must say to skip counting for *(skip counting)* slugs`);
  }
});

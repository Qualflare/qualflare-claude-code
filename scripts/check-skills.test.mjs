// Tests for scripts/check-skills.mjs. Run: node --test scripts/check-skills.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPlugin } from './check-skills.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Builds a throwaway plugin tree: { 'skills/x/SKILL.md': '...', ... }.
function plugin(files) {
  const root = mkdtempSync(join(tmpdir(), 'qf-check-skills-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

function skill(name, body, hint = '') {
  const h = hint ? `argument-hint: "${hint}"\n` : '';
  return `---\nname: ${name}\ndescription: test\n${h}---\n\n${body}\n`;
}

function checksHit(root) {
  try {
    return checkPlugin(root).map((v) => v.check);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the plugin in this repo passes every check', () => {
  const violations = checkPlugin(REPO);
  assert.deepEqual(violations, [], violations.map((v) => `${v.file}:${v.line} [${v.check}] ${v.message}`).join('\n'));
});

test('a command with the same name as a skill is flagged', () => {
  const hits = checksHit(plugin({
    'skills/qf-state/SKILL.md': skill('qf-state', 'Full instructions.'),
    'commands/qf-state.md': '---\ndescription: x\n---\n\nUse the qf-state skill.\n',
  }));
  assert.ok(hits.includes('command-shadows-skill'));
});

test('a command whose name matches a skill frontmatter name is flagged', () => {
  const hits = checksHit(plugin({
    'skills/state-dir/SKILL.md': skill('qf-state', 'Full instructions.'),
    'commands/qf-state.md': '---\ndescription: x\n---\n\nwrapper\n',
  }));
  assert.ok(hits.includes('command-shadows-skill'));
});

test('a command with no matching skill is fine', () => {
  const hits = checksHit(plugin({
    'skills/qf-run/SKILL.md': skill('qf-run', 'x'),
    'commands/qf-hook.md': '---\ndescription: x\n---\n\nToggle.\n',
  }));
  assert.ok(!hits.includes('command-shadows-skill'));
});

test('bare $CLAUDE_PROJECT_DIR is flagged, braced is not', () => {
  assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', 'mkdir -p $CLAUDE_PROJECT_DIR/.qualflare') })).includes('bare-project-dir'));
  assert.ok(!checksHit(plugin({ 'skills/a/SKILL.md': skill('a', 'mkdir -p "${CLAUDE_PROJECT_DIR}/.qualflare"') })).includes('bare-project-dir'));
});

test('a token on qf login argv is flagged', () => {
  for (const body of [
    'Run `qf login <identifier> <token>` for each one.',
    'qf login acme <pasted-token>',
    'fix `qf login ${identifier} <token>`',
  ]) {
    assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('token-in-chat-or-argv'), body);
  }
});

test('asking the user to paste a token into chat is flagged', () => {
  for (const body of [
    'Paste the token below (or type `skip`).',
    'Please paste your API key here.',
    'Treat the message as the pasted token.',
  ]) {
    assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('token-in-chat-or-argv'), body);
  }
});

test('token-safe wording is not flagged', () => {
  for (const body of [
    "The CLI's hint `No projects configured. Run 'qf login <identifier> <token>' to get started.` means none.",
    'In your terminal run `qf login <identifier>`.',
    'Run `qf login acme --force` to overwrite.',
    'Do not paste the token here.',
    'qf login acme-api   (run in your terminal)',
  ]) {
    assert.ok(!checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('token-in-chat-or-argv'), body);
  }
});

test('a JSON-parser slug written as XML is flagged', () => {
  for (const body of [
    '`npx mocha --reporter xunit > ${CLAUDE_PROJECT_DIR}/.qualflare/results/root/mocha.xml`',
    'Output file: `.qualflare/results/<package-dir>/playwright.xml`',
    '`bundle exec rspec --format RspecJunitFormatter --out x`',
    '`npx cypress run --reporter junit`',
  ]) {
    assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('result-format-mismatch'), body);
  }
  assert.ok(!checksHit(plugin({ 'skills/a/SKILL.md': skill('a', '`<R>/mocha.json` and `<R>/python.xml`') })).includes('result-format-mismatch'));
});

test('playwright --output-file is flagged', () => {
  const body = '`npx playwright test --reporter=json --output-file=x.json`';
  assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('unsupported-runner-flag'));
});

test('a hardcoded --environment is flagged, the prohibition is not', () => {
  assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', 'qf x collect f --environment "local"') })).includes('hardcoded-environment'));
  assert.ok(!checksHit(plugin({ 'skills/a/SKILL.md': skill('a', '**Do not pass `--environment`.**') })).includes('hardcoded-environment'));
});

test('classifying qf failures by stderr keywords is flagged', () => {
  const body = 'If it exits non-zero AND the error output contains any of the words `auth`, `token`: stop.';
  assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('stderr-keyword-classification'));
});

test('identifier-scoped validate is flagged, flat validate is not', () => {
  assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', '`qf <identifier> validate --format x f`') })).includes('identifier-scoped-validate'));
  assert.ok(!checksHit(plugin({ 'skills/a/SKILL.md': skill('a', '`qf validate --format x f`') })).includes('identifier-scoped-validate'));
});

test('copying a glob onto one file is flagged, into a directory is not', () => {
  assert.ok(checksHit(plugin({ 'skills/a/SKILL.md': skill('a', '`cp target/surefire-reports/*.xml $OUT/junit.xml`') })).includes('cp-glob-onto-file'));
  assert.ok(!checksHit(plugin({ 'skills/a/SKILL.md': skill('a', '`cp target/surefire-reports/TEST-*.xml "<R>/junit/"`') })).includes('cp-glob-onto-file'));
});

test('an argument mode the target skill does not declare is flagged', () => {
  const hits = checksHit(plugin({
    'skills/qf-run/SKILL.md': skill('qf-run', 'Run tests.', 'framework-slug'),
    'skills/qf-init/SKILL.md': skill('qf-init', 'then run `/qf-run <results-file>` to upload'),
  }));
  assert.ok(hits.includes('undefined-argument-mode'));
  const ok = checksHit(plugin({
    'skills/qf-run/SKILL.md': skill('qf-run', 'Run tests.', 'framework-slug | report-path [slug]'),
    'skills/qf-init/SKILL.md': skill('qf-init', 'then run `/qf-run <report-path> <slug>` to upload'),
  }));
  assert.ok(!ok.includes('undefined-argument-mode'));
});

test('a command hint does not stand in for a skill that lacks the mode', () => {
  const hits = checksHit(plugin({
    'skills/qf-run/SKILL.md': skill('qf-run', 'Run `/qf-run <results-file>` to upload.'),
    'commands/qf-run.md': '---\nargument-hint: "[framework-slug or results-file]"\n---\n\nwrapper\n',
  }));
  assert.ok(hits.includes('undefined-argument-mode'));
});

test('a qf-run runner row without a fixture in its parser format is flagged', () => {
  const row = (slug, file) => `| \`${slug}\` | \`run it\` | \`${slug}\` | \`<R>/${file}\` |`;
  const table = ['| Detected slug | Cmd | Upload slug | Result path |', '|---|---|---|---|', row('mocha', 'mocha.json')].join('\n');
  const root = plugin({ 'skills/qf-run/SKILL.md': skill('qf-run', table, 'framework-slug') });
  try {
    assert.ok(checkPlugin(root).some((v) => v.check === 'runner-fixture'));
    mkdirSync(join(root, 'tests/fixtures/reports'), { recursive: true });
    writeFileSync(join(root, 'tests/fixtures/reports/mocha.xml'), '<x/>');
    assert.ok(checkPlugin(root).some((v) => v.check === 'runner-fixture'), 'an .xml fixture must not satisfy a JSON parser');
    cpSync(join(REPO, 'tests/fixtures/reports/mocha.json'), join(root, 'tests/fixtures/reports/mocha.json'));
    assert.ok(!checkPlugin(root).some((v) => v.check === 'runner-fixture'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A runner that crashes before writing leaves the previous report in place; the
// upload step only checks existence, so it would upload as this commit's run.
test('a runner row that does not remove its previous result first is flagged', () => {
  const head = ['| Detected slug | Cmd | Upload slug | Result path |', '|---|---|---|---|'];
  const hit = (rows, extra = '') => checksHit(plugin({ 'skills/qf-run/SKILL.md': skill('qf-run', [...head, ...rows].join('\n') + '\n\n' + extra, 'framework-slug') })).includes('stale-result-upload');
  // file results
  assert.ok(hit(['| `jest` | `npx jest --json --outputFile="<R>/jest.json"` | `jest` | `<R>/jest.json` |']), 'no rm at all');
  assert.ok(hit(['| `jest` | `npx jest --json --outputFile="<R>/jest.json"`, then `rm -f "<R>/jest.json"` | `jest` | `<R>/jest.json` |']), 'rm after the runner');
  assert.ok(hit(['| `jest` | `rm -f "<R>/other.json"`, then `npx jest --json --outputFile="<R>/jest.json"` | `jest` | `<R>/jest.json` |']), 'rm of a different file');
  assert.ok(!hit(['| `jest` | `rm -f "<R>/jest.json"`, then `npx jest --json --outputFile="<R>/jest.json"` | `jest` | `<R>/jest.json` |']));
  assert.ok(!hit(['| `phpunit` | `rm -f "<R>/phpunit.xml"`, then `./vendor/bin/phpunit --log-junit "<R>/phpunit.xml"` | `phpunit` | `<R>/phpunit.xml` |']));
  // "See note below" rows are checked against the note
  const cuc = '| `cucumber` | See note below | `cucumber` | `<R>/cucumber.json` |';
  assert.ok(hit([cuc], '**cucumber note:** run `npx cucumber-js --format json:"<R>/cucumber.json"`.\n'));
  assert.ok(hit([cuc], '**cucumber note:** First `rm -f "<R>/cucumber.json"`.\n\n**cypress note:** x\n'.replace('First', 'Later, after `npx cucumber-js`,')));
  assert.ok(hit([cuc]), 'a missing note is flagged');
  assert.ok(!hit([cuc], '**cucumber note:** First `rm -f "<R>/cucumber.json"`. Then `npx cucumber-js --format json:"<R>/cucumber.json"`.\n'));
  // the rm in ANOTHER slug's note does not count
  assert.ok(hit([cuc], '**cucumber note:** run `npx cucumber-js`.\n\n**other note:** `rm -f "<R>/cucumber.json"`\n'));
  // directory results need rm -rf of the directory
  const cy = '| `cypress` | See note below | `cypress` | `<R>/cypress/` (one JSON per spec) |';
  assert.ok(hit([cy], '**cypress note:** `npx cypress run --reporter mochawesome`\n'));
  assert.ok(hit([cy], '**cypress note:** `rm -f "<R>/cypress"` then `npx cypress run`\n'), 'rm -f does not remove a directory');
  assert.ok(!hit([cy], '**cypress note:** `rm -rf "<R>/cypress" && mkdir -p "<R>/cypress"` then `npx cypress run`\n'));
  // `build.gradle` in prose is not the gradle runner
  const ju = '| `junit` | See note below | `junit` | `<R>/junit/` |';
  assert.ok(!hit([ju], '**junit note:** Check for `build.gradle`. First `rm -rf "<R>/junit"`. Then `gradle cleanTest test`.\n'));
});

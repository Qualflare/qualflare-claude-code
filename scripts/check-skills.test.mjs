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
  assert.ok(!checksHit(plugin({ 'skills/a/SKILL.md': skill('a', '`cp build/out/TEST-*.xml "<R>/junit/"`') })).includes('cp-glob-onto-file'));
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

// `/qf-run cypress` in a standard Cypress project: `cypress` is also the ./cypress
// directory. If path matching ran first, the run became a report upload of that
// directory instead of running Cypress.
test('qf-run treats an exact slug as a slug filter before any path matching', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(join(REPO, 'skills/qf-run/SKILL.md'), 'utf8');
  const rules = text.slice(text.indexOf('**Interpret `$ARGUMENTS`**'), text.indexOf('If the filtered queue is empty'));
  const items = [...rules.matchAll(/^(\d+)\. (.*)$/gm)].map((m) => ({ n: Number(m[1]), text: m[2] }));
  const slugRule = items.find((i) => /\*\*exactly\*\* a slug in the `Slug` column of `## Frameworks in use`/.test(i.text));
  const pathRules = items.filter((i) => /path|report-upload/i.test(i.text) && i !== slugRule);
  assert.ok(slugRule, 'an "exactly a slug in ## Frameworks in use" rule exists');
  assert.ok(pathRules.length > 0);
  for (const r of pathRules) assert.ok(slugRule.n < r.n, `slug rule (${slugRule.n}) must come before "${r.text.slice(0, 50)}…" (${r.n})`);
  // A bare directory is not a report until the user confirms it or names a slug.
  assert.match(rules, /existing \*\*directory\*\* \*and\* a second token that is a slug/);
  assert.match(rules, /enter report-upload mode only if the user confirms/);
});

test('mochawesome reportFilename=[name] without overwrite=false is flagged', () => {
  const cmd = (o) => `npx cypress run --reporter mochawesome --reporter-options "reportDir=<R>/cypress,${o},html=false,json=true"`;
  const hit = (body) => checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('mochawesome-filename-collision');
  assert.ok(hit(cmd('reportFilename=[name]')));
  assert.ok(hit(cmd('reportFilename=[name],overwrite=true')));
  assert.ok(!hit(cmd('reportFilename=[name],overwrite=false')));
  assert.ok(!hit(cmd('reportFilename=mochawesome')), 'a fixed name is a different defect, not this one');
});

test('the cypress fixture holds two same-named specs kept apart by overwrite=false', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = join(REPO, 'tests/fixtures/reports/cypress');
  const names = readdirSync(dir).sort();
  assert.deepEqual(names, ['login.json', 'login_001.json']);
  const specs = names.map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')).results[0].fullFile);
  assert.equal(new Set(specs).size, 2, 'the two reports come from different specs');
  for (const n of names) {
    const marge = JSON.parse(readFileSync(join(dir, n), 'utf8')).meta.marge.options;
    assert.equal(marge.reportFilename, '[name]');
    assert.equal(String(marge.overwrite), 'false');
  }
});

// `qf collect` expands any directory argument to its top-level *.json files and
// errors when there are none (qualflare-cli expandDirectories), so an .xcresult
// bundle — a directory with no top-level JSON — never reaches the xctest parser.
test('qf-run does not offer an .xcresult bundle as an uploadable xctest report', async () => {
  const { readFileSync } = await import('node:fs');
  const row = readFileSync(join(REPO, 'skills/qf-run/SKILL.md'), 'utf8').split('\n').find((l) => l.startsWith('| `xctest` |'));
  assert.ok(row, 'qf-run has an xctest format row');
  assert.doesNotMatch(row, /\bor an `\.xcresult` bundle/);
  assert.match(row, /JUnit XML/);
  assert.match(row, /\*\*Not\*\* an `\.xcresult` bundle/);
});

test('copying only the root module\'s JUnit reports is flagged', () => {
  const hit = (body) => checksHit(plugin({ 'skills/a/SKILL.md': skill('a', body) })).includes('single-module-junit-collect');
  assert.ok(hit('`mvn test`, then `cp target/surefire-reports/TEST-*.xml "<R>/junit/"`'));
  assert.ok(hit('then `cp ./build/test-results/test/TEST-*.xml "<R>/junit/"`'));
  assert.ok(!hit('find . -path \'*/target/surefire-reports/TEST-*.xml\' | while IFS= read -r f; do cp "$f" "<R>/junit/x"; done'));
});

// Runs the exact collection loops from /qf-run's junit note against a
// multi-module tree: every module's report is collected, and two modules'
// same-named TEST-*.xml land under distinct names.
test('qf-run junit collection loops collect every module without collisions', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const text = readFileSync(join(REPO, 'skills/qf-run/SKILL.md'), 'utf8');
  const note = text.slice(text.indexOf('**junit note:**'), text.indexOf('**cucumber note:**'));
  const loops = [...note.matchAll(/^\s*(find \. -path .*done)$/gm)].map((m) => m[1]);
  assert.equal(loops.length, 2, 'one Maven and one Gradle loop');
  const root = mkdtempSync(join(tmpdir(), 'qf-junit-'));
  try {
    const put = (rel) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), '<testsuite/>'); };
    for (const d of ['target/surefire-reports', 'core/target/surefire-reports', 'svc/api/target/surefire-reports']) put(`${d}/TEST-com.acme.FooTest.xml`);
    put('core/target/surefire-reports/com.acme.FooTest.txt');
    for (const d of ['build/test-results/test', 'app/build/test-results/test']) put(`${d}/TEST-com.acme.BarTest.xml`);
    for (const shell of ['bash', 'zsh']) {
      if (spawnSync(shell, ['-c', 'true']).status !== 0) continue;
      const R = join(root, `R-${shell}`);
      const out = join(R, 'junit');
      mkdirSync(out, { recursive: true });
      for (const loop of loops) {
        const r = spawnSync(shell, ['-c', loop.replaceAll('<R>', R)], { cwd: root, encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
      }
      assert.deepEqual(readdirSync(out).sort(), [
        'app__TEST-com.acme.BarTest.xml',
        'core__TEST-com.acme.FooTest.xml',
        'root__TEST-com.acme.BarTest.xml',
        'root__TEST-com.acme.FooTest.xml',
        'svc_api__TEST-com.acme.FooTest.xml',
      ], shell);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

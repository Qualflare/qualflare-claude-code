// /qf-fix Step 2 tells the model which fields of each report to read. Those
// names are prose, so nothing failed when they were wrong: the Jest section
// named `testFilePath` and `testResults[j]`, which Jest's --json output does not
// have (it has `name` and `assertionResults`). This test reads every field name
// each section mentions and requires it to exist in the matching fixture —
// real runner output under tests/fixtures/reports/.
//
// Run: node --test scripts/qf-fix-fields.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const FX = join(REPO, 'tests', 'fixtures', 'reports');

// Section heading prefix in qf-fix Step 2 → fixture files.
const SECTIONS = {
  'jest / vitest': ['jest.json'],
  golang: ['golang.json'],
  mocha: ['mocha.json'],
  playwright: ['playwright.json'],
  cypress: readdirSync(join(FX, 'cypress')).map((n) => join('cypress', n)),
  rspec: ['rspec.json'],
  cucumber: ['cucumber.json'],
};

// Words in a section that are not report fields: the output record's own keys,
// loop variables, JS helpers and literal values.
const NOT_FIELDS = new Set([
  'package', 'slug', 'testFile', 'testName', 'errorMessage', 'errorOutput', 'goPackage', 'failingStep', 'line',
  'entry', 'spec', 'suite', 'result', 'test', 'feature', 'scenario', 'example', 'step', 'i', 'j',
  'join', 'length', 'failed', 'fail', 'pass', 'output', 'unexpected', 'timedOut', 'true', 'false', 'JSON', 'NDJSON',
]);

export function fieldsOf(section) {
  const names = new Set();
  const add = (expr) => {
    for (const part of expr.split(/[^A-Za-z_]+/)) if (/^[A-Za-z_]\w*$/.test(part) && !NOT_FIELDS.has(part)) names.add(part);
  };
  // `backticked` names, excluding quoted values like `"failed"`.
  for (const m of section.matchAll(/`([^`"'\s][^`]*)`/g)) if (/^[\w.[\]]+(?:\s*===?.*)?$/.test(m[1])) add(m[1].split(/\s*===?/)[0]);
  // Record lines `  key: expr` in the code blocks. The expr mixes fields with
  // prose ("the failing result's errors[0].message"), so take only dotted or
  // indexed paths, or the whole expr when it is one bare identifier.
  for (const m of section.matchAll(/^\s+\w+: ([^\n]+?),?$/gm)) {
    const expr = m[1].replace(/'[^']*'/g, ' ').replace(/\([^)]*\)/g, ' ').trim();
    if (/^[A-Za-z_]\w*$/.test(expr)) add(expr);
    for (const p of expr.matchAll(/[A-Za-z_]\w*(?:\[\w*\])?(?:\.[A-Za-z_]\w*(?:\[\w*\])?)+|[A-Za-z_]\w*\[\w*\]/g)) add(p[0]);
  }
  return [...names];
}

function keysOf(files) {
  const keys = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') for (const k of Object.keys(o)) { keys.add(k); walk(o[k]); }
  };
  for (const f of files) {
    const text = readFileSync(join(FX, f), 'utf8');
    if (f.endsWith('golang.json')) text.trim().split('\n').forEach((l) => walk(JSON.parse(l)));
    else walk(JSON.parse(text));
  }
  return keys;
}

function sections() {
  const md = readFileSync(join(REPO, 'skills', 'qf-fix', 'SKILL.md'), 'utf8');
  const step2 = md.slice(md.indexOf('## Step 2'), md.indexOf('**JUnit XML format**'));
  const out = {};
  for (const name of Object.keys(SECTIONS)) {
    const start = step2.indexOf(`**${name} (`);
    assert.ok(start >= 0, `qf-fix Step 2 has a **${name} (...)** section`);
    const rest = step2.slice(start + 2);
    const end = rest.search(/\n\*\*[a-z]/);
    out[name] = step2.slice(start, end < 0 ? step2.length : start + 2 + end);
  }
  return out;
}

for (const [name, text] of Object.entries(sections())) {
  test(`qf-fix ${name}: every field it names exists in the ${name} fixture`, () => {
    const keys = keysOf(SECTIONS[name]);
    const fields = fieldsOf(text);
    assert.ok(fields.length >= 3, `found only ${fields.join(', ')} in the ${name} section`);
    const missing = fields.filter((f) => !keys.has(f));
    assert.deepEqual(missing, [], `qf-fix names ${missing.map((m) => '`' + m + '`').join(', ')} for ${name}, which the fixture does not have`);
  });
}

test('the jest fixture has a failed assertion where qf-fix says to look', () => {
  const j = JSON.parse(readFileSync(join(FX, 'jest.json'), 'utf8'));
  const failed = j.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => ({ file: f.name, a })));
  assert.ok(failed.length > 0);
  assert.match(failed[0].file, /\.test\.js$/);
  assert.ok(Array.isArray(failed[0].a.ancestorTitles) && failed[0].a.title && failed[0].a.failureMessages[0]);
});

test('qf-fix does not claim a `::` in pytest classname (it is a dotted module path)', () => {
  const md = readFileSync(join(REPO, 'skills', 'qf-fix', 'SKILL.md'), 'utf8');
  const xml = readFileSync(join(FX, 'python.xml'), 'utf8');
  assert.doesNotMatch(xml, /classname="[^"]*::/);
  assert.doesNotMatch(md, /pytest uses `[^`]*::/);
  assert.match(md, /dotted module path/);
});

test('fieldsOf reads backticked names and record expressions', () => {
  const f = fieldsOf('- `testFilePath` — path\n```\n{\n  testFile: testResults[i].name,\n  errorMessage: failureMessages[0] (first)\n}\n```');
  assert.deepEqual(f.sort(), ['failureMessages', 'name', 'testFilePath', 'testResults']);
});

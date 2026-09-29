import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateManifests, run } from './validate-manifests.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const plugin = (o = {}) => ({ name: 'qualflare', description: 'd', version: '1.2.3', ...o });
const market = (entry = {}, o = {}) => ({
  name: 'qualflare',
  owner: { name: 'Qualflare' },
  plugins: [{ name: 'qualflare', source: './', version: '1.2.3', ...entry }],
  ...o,
});
const errs = (p, m) => validateManifests(p, m).join('\n');

test('the shipped manifests are valid', () => {
  const r = run(REPO);
  assert.equal(r.code, 0, r.err);
});

test('a well-formed pair passes', () => {
  assert.deepEqual(validateManifests(plugin(), market()), []);
});

test('version drift between plugin.json and the marketplace entry fails', () => {
  assert.match(errs(plugin({ version: '0.19.0' }), market({ version: '0.18.0' })), /entry version "0\.18\.0" differs from plugin\.json version "0\.19\.0"/);
});

test('an entry with no version is fine (plugin.json is authoritative)', () => {
  const m = market();
  delete m.plugins[0].version;
  assert.deepEqual(validateManifests(plugin(), m), []);
});

test('a non-semver or missing plugin version fails', () => {
  assert.match(errs(plugin({ version: 'v1.2' }), market({ version: 'v1.2' })), /must be MAJOR\.MINOR\.PATCH/);
  const p = plugin();
  delete p.version;
  const m = market();
  delete m.plugins[0].version;
  assert.match(errs(p, m), /"version" is required/);
});

test('name must be present, kebab-case, and match the marketplace entry', () => {
  assert.match(errs(plugin({ name: '' }), market()), /"name" is required/);
  assert.match(errs(plugin({ name: 'Qual Flare' }), market()), /must be kebab-case/);
  assert.match(errs(plugin({ name: 'qualflare-ai' }), market()), /entry name "qualflare" differs from plugin\.json name "qualflare-ai"/);
});

test('marketplace required fields: name, owner.name, plugins[].name/source', () => {
  assert.match(errs(plugin(), market({}, { owner: {} })), /"owner" is required/);
  assert.match(errs(plugin(), market({}, { name: 'my market' })), /must not contain spaces/);
  assert.match(errs(plugin(), market({}, { plugins: [] })), /non-empty array/);
  assert.match(errs(plugin(), market({ source: undefined })), /"source" is required/);
  assert.match(errs(plugin(), market({ source: './../x' })), /must not contain "\.\."/);
});

test('invalid JSON on disk is reported, not thrown', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'manifests-'));
  try {
    mkdirSync(path.join(dir, '.claude-plugin'));
    writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), '{"name": "qualflare",');
    writeFileSync(path.join(dir, '.claude-plugin', 'marketplace.json'), JSON.stringify(market()));
    const r = run(dir);
    assert.equal(r.code, 1);
    assert.match(r.err, /plugin\.json: invalid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a frameworks list in the marketplace entry fails (unread by Claude Code, drifts silently)', () => {
  assert.match(errs(plugin(), market({ frameworks: ['jest'] })), /"frameworks" is not read by Claude Code/);
});

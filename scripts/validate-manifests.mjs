#!/usr/bin/env node
// validate-manifests.mjs — structural checks on .claude-plugin/plugin.json and
// .claude-plugin/marketplace.json that `claude plugin validate` does not make.
//
// Per the Claude Code plugin reference (code.claude.com/docs/en/plugins-reference):
//   - plugin.json: "`name` is the only required key ... Use kebab-case"; `version` is
//     "A version string, not checked against semver".
//   - marketplace.json: "The file requires a `name`, an `owner`, and a `plugins` array.
//     Each object in `plugins` is a plugin entry and needs a `name` and a `source`."
//   - "Keep the entry name and the manifest name the same" — a mismatch makes
//     installing by the manifest name fail with `Plugin "<name>" not found`.
//   - "the manifest's `version` overrides the entry's", so an entry version that
//     differs from plugin.json is silently wrong in the marketplace listing.
//
// On top of that, this repo's own conventions (scripts/release.sh):
//   - version is MAJOR.MINOR.PATCH, and it is required (setting it is what
//     pins users to a release — see the reference's `version` section).
//   - release.sh bumps both files, so they must agree.
//
// Exit 0 = valid, 1 = a problem was found. Run: node scripts/validate-manifests.mjs [pluginRoot]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';

/** Validate the two parsed manifests. Returns a list of error strings. */
export function validateManifests(plugin, marketplace) {
  const errors = [];

  if (!isObj(plugin)) {
    errors.push('plugin.json: must be a JSON object');
  } else {
    if (!isStr(plugin.name)) errors.push('plugin.json: "name" is required and must be a non-empty string');
    else if (!KEBAB.test(plugin.name)) errors.push(`plugin.json: "name" must be kebab-case, got "${plugin.name}"`);
    if (!isStr(plugin.version)) errors.push('plugin.json: "version" is required (it is what pins users to a release)');
    else if (!SEMVER.test(plugin.version)) errors.push(`plugin.json: "version" must be MAJOR.MINOR.PATCH, got "${plugin.version}"`);
    if (plugin.description !== undefined && !isStr(plugin.description)) errors.push('plugin.json: "description" must be a non-empty string');
  }

  if (!isObj(marketplace)) {
    errors.push('marketplace.json: must be a JSON object');
    return errors;
  }
  if (!isStr(marketplace.name)) errors.push('marketplace.json: "name" is required and must be a non-empty string');
  else if (/\s/.test(marketplace.name)) errors.push(`marketplace.json: "name" must not contain spaces, got "${marketplace.name}"`);
  if (!isObj(marketplace.owner) || !isStr(marketplace.owner.name)) errors.push('marketplace.json: "owner" is required and needs a "name"');
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    errors.push('marketplace.json: "plugins" must be a non-empty array');
    return errors;
  }

  const seen = new Set();
  marketplace.plugins.forEach((entry, i) => {
    const at = `marketplace.json: plugins[${i}]`;
    if (!isObj(entry)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    if (!isStr(entry.name)) errors.push(`${at}: "name" is required`);
    else if (/\s/.test(entry.name)) errors.push(`${at}: "name" must not contain spaces`);
    else if (seen.has(entry.name)) errors.push(`${at}: duplicate plugin name "${entry.name}"`);
    else seen.add(entry.name);
    if (!(isStr(entry.source) || isObj(entry.source))) errors.push(`${at}: "source" is required`);
    else if (isStr(entry.source) && entry.source.split('/').includes('..')) errors.push(`${at}: "source" must not contain ".."`);
  });

  // The entry that points at this repository's root IS the plugin in plugin.json.
  const self = marketplace.plugins.find((e) => isObj(e) && (e.source === './' || e.source === '.'));
  if (!self) {
    errors.push('marketplace.json: no plugins[] entry has source "./" — nothing lists this plugin');
  } else if (isObj(plugin)) {
    if (isStr(plugin.name) && self.name !== plugin.name) {
      errors.push(`marketplace.json: entry name "${self.name}" differs from plugin.json name "${plugin.name}"`);
    }
    if (self.version !== undefined && self.version !== plugin.version) {
      errors.push(`marketplace.json: entry version "${self.version}" differs from plugin.json version "${plugin.version}" (plugin.json wins at load, so the listing is wrong)`);
    }
  }
  return errors;
}

/** Read and validate the manifests under root. Returns { code, out, err }. */
export function run(root) {
  const read = (rel) => {
    const p = path.join(root, rel);
    try {
      return { value: JSON.parse(readFileSync(p, 'utf8')) };
    } catch (e) {
      return { error: `${rel}: ${e.code === 'ENOENT' ? 'file not found' : `invalid JSON (${e.message})`}` };
    }
  };
  const plugin = read('.claude-plugin/plugin.json');
  const market = read('.claude-plugin/marketplace.json');
  const parseErrors = [plugin.error, market.error].filter(Boolean);
  const errors = parseErrors.length ? parseErrors : validateManifests(plugin.value, market.value);
  if (errors.length) return { code: 1, out: '', err: errors.map((e) => `ERROR: ${e}\n`).join('') };
  return { code: 0, out: `OK: manifests valid (${plugin.value.name}@${plugin.value.version})\n`, err: '' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const r = run(root);
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exit(r.code);
}

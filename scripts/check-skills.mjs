#!/usr/bin/env node
// check-skills.mjs — static checks for defect classes in the plugin's markdown
// skills and commands that no unit test can reach, because the "code" is prose
// the model follows. Each check names a class of bug that has shipped before.
//
//   node scripts/check-skills.mjs [plugin-root]
//
// Exits 1 and prints one line per violation when any check fails.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The report format each CLI parser reads, for every slug /qf-run has a runner
// command for. Source: qualflare-cli internal/adapters/parsers — unit/jest,
// unit/golang (NDJSON, .json), unit/mocha, e2e/playwright, e2e/cypress
// (Mochawesome), unit/rspec and bdd/cucumber decode JSON; unit/pytest,
// unit/phpunit and generic/junit decode XML. With --format set, the CLI does
// not sniff content, so a file in the wrong format simply fails to parse.
export const PARSER_FORMAT = {
  jest: 'json',
  golang: 'json',
  mocha: 'json',
  playwright: 'json',
  cypress: 'json',
  rspec: 'json',
  cucumber: 'json',
  python: 'xml',
  phpunit: 'xml',
  junit: 'xml',
  // @qualflare/webdriverio and @qualflare/appium write qualflare-json, one
  // file per WebdriverIO worker.
  webdriverio: 'json',
  appium: 'json',
  // flutter test --file-reporter json: output.
  flutter: 'json',
};

// Result paths that are directories (one report per spec / per test class).
export const DIRECTORY_RESULTS = new Set(['cypress', 'junit', 'webdriverio', 'appium']);

// The CLI's own "nothing configured" hint. Skills quote it verbatim to match
// `qf projects` output, so it is exempt from the token-on-argv check.
const CLI_EMPTY_HINT = "No projects configured. Run 'qf login <identifier> <token>' to get started.";

function listMarkdown(root) {
  const out = [];
  for (const dir of ['skills', 'commands']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.md')) out.push(p);
      }
    };
    walk(base);
  }
  return out;
}

export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return fm;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function each(re, text, fn) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(text)) !== null) fn(m);
}

// ---------------------------------------------------------------------------
// Checks. Each takes { root, files: [{ path, rel, text }] } and returns
// violations as { check, file, line, message }.
// ---------------------------------------------------------------------------

// A plugin command and a skill with the same name: invoking the name loads the
// command body, so the skill's instructions never reach the model.
export function checkCommandShadowsSkill({ root }) {
  const out = [];
  const cmdDir = join(root, 'commands');
  const skillDir = join(root, 'skills');
  if (!existsSync(cmdDir) || !existsSync(skillDir)) return out;
  const skillNames = new Set();
  for (const d of readdirSync(skillDir)) {
    const p = join(skillDir, d, 'SKILL.md');
    if (!existsSync(p)) continue;
    skillNames.add(d);
    const name = frontmatter(readFileSync(p, 'utf8')).name;
    if (name) skillNames.add(name);
  }
  for (const f of readdirSync(cmdDir)) {
    if (!f.endsWith('.md')) continue;
    const name = basename(f, '.md');
    if (skillNames.has(name)) {
      out.push({
        check: 'command-shadows-skill',
        file: `commands/${f}`,
        line: 1,
        message: `command "${name}" has the same name as skill "${name}"; the command body loads instead of the skill — delete the command or rename one of them`,
      });
    }
  }
  return out;
}

// $CLAUDE_PROJECT_DIR without braces is not substituted in skill text, and the
// Bash tool has no such variable, so the path collapses to "/.qualflare/...".
export function checkBareProjectDir({ files }) {
  const out = [];
  for (const f of files) {
    each(/\$CLAUDE_PROJECT_DIR\b/, f.text, (m) => {
      out.push({
        check: 'bare-project-dir',
        file: f.rel,
        line: lineOf(f.text, m.index),
        message: 'bare $CLAUDE_PROJECT_DIR is not substituted in skill text and is unset in the Bash tool; write ${CLAUDE_PROJECT_DIR}',
      });
    });
  }
  return out;
}

// A token must never be requested in chat (it lands in the transcript and goes
// to the model) nor passed on argv (process list, shell history), in the
// environment, or on stdin — `qf login` reads QF_TOKEN and a piped stdin too, so
// all of them are the token leaving the hidden prompt.

// The places a skill writes a command: inline code spans, fenced-block lines,
// and plain lines that start with the command. Returns [{ text, index }] where
// index is the offset of text in the file.
export function commandContexts(text) {
  const out = [];
  let inFence = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    else if (inFence || /^\s*(?:\$\s+)?(?:qf|QF_\w+=|echo|printf|cat)\b/.test(line)) out.push({ text: line, index: offset });
    else for (const m of line.matchAll(/`([^`\n]+)`/g)) out.push({ text: m[1], index: offset + m.index + 1 });
    offset += line.length + 1;
  }
  return out;
}

/** Why one `qf login ...` command leaks the token, or null. `args` is what follows `qf login`. */
export function loginArgvProblem(args) {
  const positionals = [];
  // A backtick ends the command (fenced examples quote commands inline too).
  for (const tok of args.split('`')[0].trim().split(/\s+/)) {
    if (tok === '' || /^[|;&>#(]/.test(tok) || tok === '—' || tok === '<<<') break;
    if (tok === '<') return 'reads the token from a redirected stdin';
    if (tok.startsWith('-')) continue; // --force
    if (/^["']/.test(tok)) return `quoted argument ${tok} (a token or a secret substitution) on argv`;
    positionals.push(tok);
  }
  if (positionals.length > 1) return `${positionals.length} positional arguments; the second is the token on argv`;
  return null;
}

// "token" as a secret, not as an argument word ("the second token", `<token>`).
const SECRET = String.raw`(?<![<\w])(?<!(?:first|second|third|next|last|each|argument|slug) )(?:api[ -]?keys?|(?:access[ -])?tokens?)\b`;
const SOLICIT_VERB = String.raw`\b(?:ask|provide|send|reply|enter|paste|share|type)\b`;

export function checkTokenHandling({ files }) {
  const out = [];
  for (const f of files) {
    const text = f.text.split(CLI_EMPTY_HINT).join(' '.repeat(CLI_EMPTY_HINT.length));
    const pushAt = (index, message) =>
      out.push({ check: 'token-in-chat-or-argv', file: f.rel, line: lineOf(text, index), message });
    for (const c of commandContexts(text)) {
      for (const m of c.text.matchAll(/\bqf\s+login\b(.*)$/g)) {
        const why = loginArgvProblem(m[1]);
        if (why) pushAt(c.index + m.index, `"${m[0].trim()}": ${why}; tell the user to run \`qf login <identifier>\` in their own terminal (hidden prompt)`);
      }
    }
    each(/\bQF_TOKEN=/, text, (m) => pushAt(m.index, '"QF_TOKEN=" puts the token in a command line or script; use the hidden prompt of `qf login <identifier>`'));
    each(/\|\s*qf\s+login\b/, text, (m) => pushAt(m.index, `"${m[0]}" pipes a token into qf login; use its hidden prompt in the user's own terminal`));
    each(/pasted[- ]token/i, text, (m) => pushAt(m.index, `"${m[0]}": a skill must not take a token from the chat`));
    // "Paste the token below", "ask the user for their API key", "reply with
    // your token", "your token — send it here" — unless negated ("never ask for
    // the token", "do not paste the token here").
    const solicit = [
      new RegExp(`${SOLICIT_VERB}[^.\\n]{0,60}?${SECRET}`, 'i'),
      new RegExp(`${SECRET}[^.\\n]{0,30}?${SOLICIT_VERB}\\s+(?:it\\s+|them\\s+)?(?:here|below|in(?:to)? (?:the |this )?chat)`, 'i'),
    ];
    for (const re of solicit) {
      each(re, text, (m) => {
        const sentence = text.slice(Math.max(0, m.index - 40), m.index).split(/[.!?\n]\s/).pop();
        if (/\b(?:never|not|don't|do not|n't|without)\b/i.test(sentence)) return;
        pushAt(m.index, `"${m[0]}" solicits a secret in chat`);
      });
    }
  }
  return out;
}

// A results file for a slug must be in the format that slug's CLI parser reads.
export function checkResultFormats({ files }) {
  const out = [];
  const slugs = Object.keys(PARSER_FORMAT).join('|');
  const re = new RegExp(`(?:results/[^\\s\`"|]*?|<R>/|<package-dir>/)(${slugs})\\.(json|xml)\\b`);
  for (const f of files) {
    each(re, f.text, (m) => {
      const [, slug, ext] = m;
      if (PARSER_FORMAT[slug] !== ext) {
        out.push({
          check: 'result-format-mismatch',
          file: f.rel,
          line: lineOf(f.text, m.index),
          message: `${slug} results written as .${ext}, but the CLI's ${slug} parser reads ${PARSER_FORMAT[slug].toUpperCase()}`,
        });
      }
    });
    // Reporters that emit a format the slug's parser cannot read.
    const bad = [
      [/mocha[^\n|]*--reporter[ =](?:xunit|junit)/, 'mocha JUnit/xunit reporter; the mocha parser reads JSON (--reporter json)'],
      [/playwright test[^\n|]*--reporter[ =]junit/, 'Playwright JUnit reporter; the playwright parser reads JSON (--reporter=json)'],
      [/cypress run[^\n|]*--reporter[ =]junit/, 'Cypress JUnit reporter; the cypress parser reads Mochawesome JSON'],
      [/RspecJunitFormatter/, 'RSpec JUnit formatter; the rspec parser reads JSON (--format json)'],
    ];
    for (const [r, message] of bad) {
      each(r, f.text, (m) =>
        out.push({ check: 'result-format-mismatch', file: f.rel, line: lineOf(f.text, m.index), message }));
    }
  }
  return out;
}

// Flags the runner's documented CLI does not have.
export function checkUnsupportedRunnerFlags({ files }) {
  const out = [];
  const bad = [
    [/playwright test[^\n|]*--output-file/, 'Playwright test has no --output-file flag; use PLAYWRIGHT_JSON_OUTPUT_FILE with --reporter=json'],
  ];
  for (const f of files) {
    for (const [r, message] of bad) {
      each(r, f.text, (m) =>
        out.push({ check: 'unsupported-runner-flag', file: f.rel, line: lineOf(f.text, m.index), message }));
    }
  }
  return out;
}

// A hardcoded --environment value 404s on /collect unless the project has an
// environment of that name; the CLI's default (QF_ENVIRONMENT or development)
// is the one every project is created with.
export function checkHardcodedEnvironment({ files }) {
  const out = [];
  const push = (f, m, what) =>
    out.push({
      check: 'hardcoded-environment',
      file: f.rel,
      line: lineOf(f.text, m.index),
      message: `do not set the environment (${what}); the CLI uses $QF_ENVIRONMENT, set by the user, or "development"`,
    });
  for (const f of files) {
    each(/--environment[ =]["'<\w$]/, f.text, (m) => push(f, m, '--environment'));
    // -e is --environment's short form on qf collect; only inside a qf command.
    each(/\bqf\b[^\n`|;]*?\s-e(?:[ =]|(?=["'<$]))\s*["'<\w$]/, f.text, (m) => push(f, m, '-e'));
    each(/\bQF_ENVIRONMENT=/, f.text, (m) => push(f, m, 'QF_ENVIRONMENT='));
  }
  return out;
}

// Failures must be classified by the CLI's exit codes, not by words in stderr
// ("auth" matches packages/auth, "token" matches a 403 message).
export function checkStderrKeywordClassification({ files }) {
  const out = [];
  for (const f of files) {
    each(/(?:error output|stderr)[^.\n]{0,40}\bcontains\b[^.\n]{0,40}`(?:auth|token|unauthorized|401)`/i, f.text, (m) =>
      out.push({
        check: 'stderr-keyword-classification',
        file: f.rel,
        line: lineOf(f.text, m.index),
        message: 'classify qf failures by exit code (3 auth, 4 forbidden, 5 not found, 7 transient), not stderr keywords',
      }));
  }
  return out;
}

// `qf <identifier> validate` only exists for a saved identifier; the flat
// `qf validate` parses locally and needs no login.
export function checkIdentifierScopedValidate({ files }) {
  const out = [];
  for (const f of files) {
    // `qf <identifier> validate`, `qf ${id} validate`, and prose "qf acme validate".
    each(/\bqf\s+(?!validate\b)[^\s`'"|;]+\s+validate\b/, f.text, (m) =>
      out.push({
        check: 'identifier-scoped-validate',
        file: f.rel,
        line: lineOf(f.text, m.index),
        message: `"${m[0]}": use \`qf validate\` (no login needed), not \`qf <identifier> validate\``,
      }));
  }
  return out;
}

// `cp dir/*.xml out/junit.xml` fails as soon as the glob matches two files.
export function checkCpGlobOntoFile({ files }) {
  const out = [];
  for (const f of files) {
    each(/\bcp\s+[^\s`]*\*[^\s`]*\s+"?[^\s`"]*\.(?:xml|json)"?(?=[\s`]|$)/, f.text, (m) =>
      out.push({
        check: 'cp-glob-onto-file',
        file: f.rel,
        line: lineOf(f.text, m.index),
        message: `"${m[0]}" copies a glob onto one file path; copy into a directory instead`,
      }));
  }
  return out;
}

// An instruction like `/qf-run <report-path>` must name an argument mode the
// target skill declares in its argument-hint.
export function checkArgumentModes({ root, files }) {
  const out = [];
  const hints = {};
  const skillDir = join(root, 'skills');
  if (existsSync(skillDir)) {
    for (const d of readdirSync(skillDir)) {
      const p = join(skillDir, d, 'SKILL.md');
      if (existsSync(p)) hints[d] = frontmatter(readFileSync(p, 'utf8'))['argument-hint'] ?? '';
    }
  }
  // A command's hint counts only for names that have no skill: where both
  // exist, the skill is what must define the mode.
  const cmdDir = join(root, 'commands');
  if (existsSync(cmdDir)) {
    for (const f of readdirSync(cmdDir)) {
      const name = basename(f, '.md');
      if (f.endsWith('.md') && !(name in hints)) hints[name] = frontmatter(readFileSync(join(cmdDir, f), 'utf8'))['argument-hint'] ?? '';
    }
  }
  for (const f of files) {
    each(/`\/(qf-[a-z-]+)((?:\s+<[a-z-]+>)+)/, f.text, (m) => {
      const target = m[1];
      if (!(target in hints)) return;
      for (const ph of m[2].match(/<[a-z-]+>/g)) {
        const word = ph.slice(1, -1);
        if (!hints[target].includes(word)) {
          out.push({
            check: 'undefined-argument-mode',
            file: f.rel,
            line: lineOf(f.text, m.index),
            message: `/${target} ${ph}: "${word}" is not an argument the /${target} skill declares (argument-hint: "${hints[target]}")`,
          });
        }
      }
    });
  }
  return out;
}

// Every slug /qf-run runs must have a known parser format and a fixture in that
// format, which CI feeds to `qf validate --format <slug>`.
export function checkRunnerFixtures({ root }) {
  const out = [];
  const p = join(root, 'skills', 'qf-run', 'SKILL.md');
  if (!existsSync(p)) return out;
  const text = readFileSync(p, 'utf8');
  each(/^\| `([a-z-]+)` \| .* \| `([a-z-]+)` \| [^|]+ \|$/m, text, (m) => {
    const slug = m[2];
    const fmt = PARSER_FORMAT[slug];
    const where = { file: 'skills/qf-run/SKILL.md', line: lineOf(text, m.index) };
    if (!fmt) {
      out.push({ check: 'runner-fixture', ...where, message: `runner row for "${slug}" has no entry in PARSER_FORMAT (scripts/check-skills.mjs)` });
      return;
    }
    const fx = join(root, 'tests', 'fixtures', 'reports');
    const has = DIRECTORY_RESULTS.has(slug)
      ? existsSync(join(fx, slug)) && readdirSync(join(fx, slug)).some((n) => n.endsWith('.' + fmt))
      : existsSync(join(fx, `${slug}.${fmt}`));
    if (!has) {
      out.push({ check: 'runner-fixture', ...where, message: `no ${fmt} fixture for "${slug}" under tests/fixtures/reports/` });
    }
  });
  return out;
}

// mochawesome's `[name]` is the spec's file name only, so two specs with the same
// name in different folders write the same report and the second replaces the
// first. `overwrite=false` makes mochawesome append a counter (`login_001.json`).
export function checkMochawesomeFilenameCollision({ files }) {
  const out = [];
  for (const f of files) {
    each(/--reporter-options\s+"([^"\n]*)"/, f.text, (m) => {
      const opts = m[1];
      if (!/reportFilename=[^,]*\[name\]/.test(opts)) return;
      if (/\boverwrite=false\b/.test(opts)) return;
      out.push({
        check: 'mochawesome-filename-collision',
        file: f.rel,
        line: lineOf(f.text, m.index),
        message: 'reportFilename=[name] without overwrite=false: specs with the same file name overwrite each other\'s reports',
      });
    });
  }
  return out;
}

// In a multi-module build every module writes its own target/surefire-reports/
// (or build/test-results/test/); copying only the root one misses them all and
// reports a false run failure. Collect with `find . -path '*/target/...'`.
export function checkSingleModuleJunitCollect({ files }) {
  const out = [];
  for (const f of files) {
    each(/\bcp\s+(?:\.\/)?(?:target\/surefire-reports|build\/test-results\/test)\//, f.text, (m) =>
      out.push({
        check: 'single-module-junit-collect',
        file: f.rel,
        line: lineOf(f.text, m.index),
        message: `"${m[0]}" collects only the root module's reports; find them recursively (find . -path '*/target/surefire-reports/TEST-*.xml') and prefix each with its module path`,
      }));
  }
  return out;
}

// Every /qf-run runner must delete its previous result before it runs. The
// upload step only checks that the result path exists, so a runner that crashes
// before writing would otherwise upload the last run's report as this commit's.
// A file result needs `rm -f "<R>/x.ext"`, a directory result `rm -rf "<R>/dir"`,
// in the row's command cell — or, for "See note below", in `**<slug> note:**` —
// before the runner itself.
// A runner invocation starts a command: after a backtick, whitespace or line start
// (so `build.gradle` in prose is not the `gradle` runner).
const RUNNER_START = /(?:^|[`\s])(?:npx|pytest|go test|bundle exec|\.\/vendor\/bin\/[\w-]+|mvn|gradle|\.\/gradlew)(?=[\s`])/m;

export function noteSection(text, slug) {
  const start = text.indexOf(`**${slug} note:**`);
  if (start < 0) return null;
  const rest = text.slice(start + 2);
  const end = rest.search(/\n(?:\*\*|#)/);
  return text.slice(start, end < 0 ? text.length : start + 2 + end);
}

export function checkResultRemovedBeforeRun({ root }) {
  const out = [];
  const p = join(root, 'skills', 'qf-run', 'SKILL.md');
  if (!existsSync(p)) return out;
  const text = readFileSync(p, 'utf8');
  each(/^\| `([a-z-]+)` \| (.*) \| `([a-z-]+)` \| ([^|]+) \|$/m, text, (m) => {
    const [, slug, cmdCell, , resultCell] = m;
    const where = { file: 'skills/qf-run/SKILL.md', line: lineOf(text, m.index) };
    const rp = /`<R>\/([^`]+)`/.exec(resultCell);
    if (!rp) return;
    const isDir = rp[1].endsWith('/');
    const target = `<R>/${rp[1].replace(/\/$/, '')}`;
    const need = isDir ? `rm -rf "${target}"` : `rm -f "${target}"`;
    let body = cmdCell;
    if (/see note below/i.test(cmdCell)) {
      body = noteSection(text, slug);
      if (body === null) {
        out.push({ check: 'stale-result-upload', ...where, message: `"${slug}" row says "See note below" but there is no **${slug} note:**` });
        return;
      }
    }
    const at = body.indexOf(need);
    const run = body.search(RUNNER_START);
    if (at < 0 || (run >= 0 && run < at)) {
      out.push({
        check: 'stale-result-upload',
        ...where,
        message: `"${slug}" must run \`${need}\` before its runner, or a runner that writes nothing leaves the previous run's ${isDir ? 'reports' : 'report'} to be uploaded as this one`,
      });
    }
  });
  return out;
}

export const CHECKS = [
  checkCommandShadowsSkill,
  checkBareProjectDir,
  checkTokenHandling,
  checkResultFormats,
  checkUnsupportedRunnerFlags,
  checkHardcodedEnvironment,
  checkStderrKeywordClassification,
  checkIdentifierScopedValidate,
  checkCpGlobOntoFile,
  checkArgumentModes,
  checkRunnerFixtures,
  checkResultRemovedBeforeRun,
  checkMochawesomeFilenameCollision,
  checkSingleModuleJunitCollect,
];

export function checkPlugin(root) {
  const files = listMarkdown(root).map((p) => ({ path: p, rel: relative(root, p), text: readFileSync(p, 'utf8') }));
  return CHECKS.flatMap((c) => c({ root, files }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const violations = checkPlugin(root);
  for (const v of violations) console.error(`${v.file}:${v.line}: [${v.check}] ${v.message}`);
  if (violations.length) {
    console.error(`\n${violations.length} violation(s)`);
    process.exit(1);
  }
  console.log(`✅ check-skills: ${CHECKS.length} checks passed`);
}

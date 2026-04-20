import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HOOK = new URL('./stop-hook.mjs', import.meta.url).pathname;

/**
 * Create a self-cleaning temp workspace.
 * Returns { projectDir, transcriptPath, cleanup }
 */
function makeWorkspace() {
  const base = mkdtempSync(join(tmpdir(), 'stop-hook-test-'));
  const projectDir = join(base, 'project');
  const transcriptPath = join(base, 'transcript.jsonl');

  // transcript file must exist (created empty by default)
  writeFileSync(transcriptPath, '');

  return {
    projectDir,
    transcriptPath,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

/**
 * Write .qualflare/config.json inside projectDir.
 */
function writeConfig(projectDir, config) {
  const dir = join(projectDir, '.qualflare');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
}

// Default newString is substantive (2 lines, > 40 chars) so existing tests pass under the triviality gate.
const SUBSTANTIVE_NEW_STRING = 'export const x = 1;\nexport const y = 2;\n';

/**
 * Write JSONL lines to the transcript file using the real Claude Code shape:
 * {type:'assistant', message:{content:[{type:'tool_use', ...}]}}
 */
function writeTranscript(transcriptPath, edits) {
  const lines = edits.map(({ name, filePath, oldString = '', newString = SUBSTANTIVE_NEW_STRING }) =>
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: `tu_${Math.random().toString(36).slice(2)}`,
            name,
            input: { file_path: filePath, old_string: oldString, new_string: newString },
          },
        ],
      },
    })
  );
  writeFileSync(transcriptPath, lines.join('\n'));
}

/**
 * Write JSONL lines using the legacy top-level tool_use shape (fallback).
 */
function writeLegacyTranscript(transcriptPath, edits) {
  const lines = edits.map(({ name, filePath, oldString = '', newString = SUBSTANTIVE_NEW_STRING }) =>
    JSON.stringify({
      type: 'tool_use',
      id: `tu_${Math.random().toString(36).slice(2)}`,
      name,
      input: { file_path: filePath, old_string: oldString, new_string: newString },
    })
  );
  writeFileSync(transcriptPath, lines.join('\n'));
}

/**
 * Run the hook with the given stdin payload and return parsed stdout.
 * Returns { stdout: string, parsed: object|null }
 */
function runHook({ transcriptPath, projectDir }) {
  const stdin = JSON.stringify({ session_id: 's1', transcript_path: transcriptPath, cwd: projectDir });
  const result = spawnSync(process.execPath, [HOOK], {
    input: stdin,
    encoding: 'utf8',
    timeout: 10_000,
  });
  const stdout = result.stdout.trim();
  let parsed = null;
  if (stdout) {
    try { parsed = JSON.parse(stdout); } catch { /* leave null */ }
  }
  return { stdout, parsed };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('Test 1: source file triggers suggestion', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/foo.ts' }]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage in stdout');
    assert.match(parsed.systemMessage, /1 source file\(s\)/);
  } finally {
    cleanup();
  }
});

test('Test 2: test file (.test.ts) is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/foo.test.ts' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout when only test file edited');
  } finally {
    cleanup();
  }
});

test('Test 3: Go test file (_test.go) is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'internal/bar_test.go' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout when only Go test file edited');
  } finally {
    cleanup();
  }
});

test('Test 4: source + test file both edited — no nudge (tests were updated)', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'src/foo.ts' },
      { name: 'Edit', filePath: 'src/foo.test.ts' },
    ]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout when both source and test files were edited');
  } finally {
    cleanup();
  }
});

test('Test 5: config disabled — no output', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: false });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/foo.ts' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout when stopHookEnabled is false');
  } finally {
    cleanup();
  }
});

test('Test 6: config missing — no output', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    // projectDir exists but .qualflare/config.json does NOT
    mkdirSync(projectDir, { recursive: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/foo.ts' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout when config.json is missing');
  } finally {
    cleanup();
  }
});

test('Test 7: empty transcript — no output', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    // transcript is already empty (created by makeWorkspace)
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for empty transcript');
  } finally {
    cleanup();
  }
});

test('Test 8: multiple source files with a test file also edited — no nudge', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Write', filePath: 'src/a.ts' },
      { name: 'Write', filePath: 'src/b.ts' },
      { name: 'Write', filePath: 'src/c.go' },
      { name: 'Edit', filePath: 'src/a.test.ts' },
    ]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout when test file was also edited alongside source files');
  } finally {
    cleanup();
  }
});

test('Test 9: Python test_*.py file is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/test_auth.py' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout when only test_*.py file edited');
  } finally {
    cleanup();
  }
});

test('Test 11: legacy top-level tool_use shape still triggers suggestion (fallback)', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeLegacyTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/legacy.ts' }]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage for legacy top-level tool_use shape');
    assert.match(parsed.systemMessage, /1 source file\(s\)/);
  } finally {
    cleanup();
  }
});

test('Test 12: vite.config.ts edit is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'vite.config.ts' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for config file edit');
  } finally {
    cleanup();
  }
});

test('Test 13: .eslintrc.js edit is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: '.eslintrc.js' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for rc config file edit');
  } finally {
    cleanup();
  }
});

test('Test 14: *.d.ts edit is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/global.d.ts' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for .d.ts type declaration file');
  } finally {
    cleanup();
  }
});

test('Test 15: types.ts edit is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/types.ts' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for types.ts edit');
  } finally {
    cleanup();
  }
});

test('Test 16: *.types.ts edit is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'src/user.types.ts' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for *.types.ts file');
  } finally {
    cleanup();
  }
});

test('Test 17: trivial single-line Edit skipped (≤1 newline, delta ≤40 chars)', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'src/foo.ts', oldString: 'const x = 1;', newString: 'const x = 2;' },
    ]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for trivial one-liner edit');
  } finally {
    cleanup();
  }
});

test('Test 18: substantive Edit (multi-line) still triggers nudge', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'src/service.ts', oldString: '', newString: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n' },
    ]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage for substantive edit');
    assert.match(parsed.systemMessage, /1 source file\(s\)/);
  } finally {
    cleanup();
  }
});

test('Test 19: Write to new file always triggers (Write is never trivial)', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    // Write with empty content — still considered substantive because tool is Write
    writeTranscript(transcriptPath, [
      { name: 'Write', filePath: 'src/new.ts', oldString: '', newString: '' },
    ]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage because Write is always substantive');
    assert.match(parsed.systemMessage, /1 source file\(s\)/);
  } finally {
    cleanup();
  }
});

test('Test 20: mixed trivial + substantive edits in same session triggers nudge', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'src/foo.ts', oldString: 'x', newString: 'y' },          // trivial
      { name: 'Edit', filePath: 'src/bar.ts', oldString: '', newString: 'export function bar() {\n  return 42;\n}\n' }, // substantive
    ]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage when at least one substantive edit exists');
    assert.match(parsed.systemMessage, /2 source file\(s\)/);
  } finally {
    cleanup();
  }
});

test('Test 21: config edit + substantive source edit still triggers with count 1', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'vite.config.ts', oldString: '', newString: 'export default {};' }, // config — excluded
      { name: 'Edit', filePath: 'src/main.ts', oldString: '', newString: 'export function main() {\n  console.log("hi");\n}\n' }, // source
    ]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage; config edit should be invisible');
    assert.match(parsed.systemMessage, /1 source file\(s\)/, 'Config file should not count toward source file total');
  } finally {
    cleanup();
  }
});

test('Test 22: source + test + config edits — no nudge (testEdited preserved)', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'src/auth.ts', oldString: '', newString: 'export function login() {\n  return true;\n}\n' },
      { name: 'Edit', filePath: 'src/auth.test.ts', oldString: '', newString: 'test("login", () => {});\n' },
      { name: 'Edit', filePath: 'jest.config.ts' },
    ]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout: testEdited should suppress nudge even with config file present');
  } finally {
    cleanup();
  }
});

test('Test 23: tsconfig.json edit is excluded', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [{ name: 'Edit', filePath: 'tsconfig.json' }]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout for tsconfig.json edit');
  } finally {
    cleanup();
  }
});

test('Test 24: single-line Edit with trailing newline is trivial (trimEnd fix)', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    // Trailing newline is normal in formatted files — must still count as single-line
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'src/foo.ts', oldString: 'const x = 1;\n', newString: 'const x = 2;\n' },
    ]);
    const { stdout } = runHook({ transcriptPath, projectDir });
    assert.equal(stdout, '', 'Expected empty stdout: single-line edit with trailing newline should be trivial');
  } finally {
    cleanup();
  }
});

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

/**
 * Write JSONL lines to the transcript file.
 * Each entry is { name, filePath } which becomes a tool_use line.
 */
function writeTranscript(transcriptPath, edits) {
  const lines = edits.map(({ name, filePath }) =>
    JSON.stringify({
      type: 'tool_use',
      id: `tu_${Math.random().toString(36).slice(2)}`,
      name,
      input: { file_path: filePath, old_string: '', new_string: '' },
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

test('Test 4: mixed source + test file — only source counts', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Edit', filePath: 'src/foo.ts' },
      { name: 'Edit', filePath: 'src/foo.test.ts' },
    ]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage in stdout');
    assert.match(parsed.systemMessage, /1 source file\(s\)/);
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

test('Test 8: multiple source files count correctly', () => {
  const { projectDir, transcriptPath, cleanup } = makeWorkspace();
  try {
    writeConfig(projectDir, { stopHookEnabled: true });
    writeTranscript(transcriptPath, [
      { name: 'Write', filePath: 'src/a.ts' },
      { name: 'Write', filePath: 'src/b.ts' },
      { name: 'Write', filePath: 'src/c.go' },
      { name: 'Edit', filePath: 'src/a.test.ts' },
    ]);
    const { parsed } = runHook({ transcriptPath, projectDir });
    assert.ok(parsed?.systemMessage, 'Expected a systemMessage in stdout');
    assert.match(parsed.systemMessage, /3 source file\(s\)/);
  } finally {
    cleanup();
  }
});

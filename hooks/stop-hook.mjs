#!/usr/bin/env node
import { createReadStream, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';

try {
  // 1. Read stdin
  const chunks = [];
  process.stdin.on('data', d => chunks.push(d));
  await new Promise(r => process.stdin.on('end', r));
  const input = JSON.parse(chunks.join(''));
  const { transcript_path, cwd } = input;

  if (!transcript_path || !cwd) process.exit(0);

  // 2. Read config — exit silently if missing or stopHookEnabled !== true
  const configPath = resolve(cwd, '.qualflare', 'config.json');
  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { process.exit(0); }
  if (config.stopHookEnabled !== true) process.exit(0);

  // 3. Read transcript and collect edited file paths
  const paths = new Set();
  const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
  const rl = createInterface({ input: createReadStream(transcript_path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === 'tool_use' && EDIT_TOOLS.has(entry.name)) {
      const p = entry.input?.file_path ?? entry.input?.path;
      if (p) paths.add(p);
    }
  }

  // 4. Classify — keep source files, discard test files and excluded dirs
  const SOURCE_EXT = /\.(?:[mc]?[jt]sx?|go|py|rb|php|rs|java|kt)$/;
  const TEST_PATTERNS = [
    /\.test\.[mc]?[jt]sx?$/,
    /\.spec\.[mc]?[jt]sx?$/,
    /[/\\]__tests__[/\\]/,
    /[/\\]e2e[/\\]/,
    /[/\\]cypress[/\\]/,
    /[/\\]playwright[/\\]/,
    /_test\.go$/,
    /(?:^|[/\\])test_[^/\\]+\.py$/,   // pytest test_*.py prefix
    /[^/\\]+_test\.py$/,               // pytest *_test.py suffix
    /[/\\]spec[/\\].+_spec\.rb$/,
    /[/\\]tests[/\\].+Test\.php$/,
  ];
  const EXCLUDE_DIRS = [
    'node_modules', 'vendor', '.git', 'dist', 'build',
    '.next', '__pycache__', '.cache',
  ];

  const sourcePaths = [...paths].filter(p => {
    if (!SOURCE_EXT.test(p)) return false;
    if (TEST_PATTERNS.some(re => re.test(p))) return false;
    if (EXCLUDE_DIRS.some(d => p.includes(`/${d}/`) || p.includes(`\\${d}\\`))) return false;
    return true;
  });

  // 5 & 6. Print suggestion if any source files were changed
  if (sourcePaths.length > 0) {
    console.log(JSON.stringify({
      systemMessage: `🔍 Qualflare: ${sourcePaths.length} source file(s) changed without test updates. Run /qualflare-cover to add coverage.`,
    }));
  }
} catch {
  // exit silently on any error — hook must never crash
}

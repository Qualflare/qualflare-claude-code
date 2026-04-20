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

  // 3. Classify patterns
  const SOURCE_EXT = /\.(?:[mc]?[jt]sx?|go|py|rb|php|rs|java|kt)$/;
  const TEST_PATTERNS = [
    /\.test\.[mc]?[jt]sx?$/,
    /\.spec\.[mc]?[jt]sx?$/,
    /[/\\]__tests__[/\\]/,
    /[/\\]e2e[/\\]/,
    /[/\\]cypress[/\\]/,
    /[/\\]playwright[/\\]/,
    /_test\.go$/,
    /(?:^|[/\\])test_[^/\\]+\.py$/,
    /[^/\\]+_test\.py$/,
    /[/\\]spec[/\\].+_spec\.rb$/,
    /[/\\]tests[/\\].+Test\.php$/,
  ];
  const CONFIG_PATTERNS = [
    /(^|[/\\])[^/\\]+\.config\.(?:[mc]?[jt]sx?|json)$/,     // vite.config.ts, babel.config.json
    /(^|[/\\])\.[^/\\]*rc\.(?:[mc]?[jt]s|json|ya?ml)$/,     // .eslintrc.js, .prettierrc.yaml
    /(^|[/\\])\.(?:eslintrc|prettierrc|babelrc|stylelintrc|commitlintrc)$/, // bare rc files
    /(^|[/\\])tsconfig(?:\.[^/\\]+)?\.json$/,                // tsconfig.json, tsconfig.app.json
  ];
  const TYPE_ONLY_PATTERNS = [
    /\.d\.[mc]?ts$/,        // *.d.ts, *.d.mts, *.d.cts
    /(^|[/\\])types\.tsx?$/, // types.ts, types.tsx
    /\.types\.tsx?$/,        // foo.types.ts
  ];
  const EXCLUDE_DIRS = [
    'node_modules', 'vendor', '.git', 'dist', 'build',
    '.next', '__pycache__', '.cache',
  ];
  const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

  function isTrivialEdit(block) {
    if (block.name !== 'Edit') return false; // Write / MultiEdit / NotebookEdit never trivial
    const oldStr = block.input?.old_string ?? '';
    const newStr = block.input?.new_string ?? '';
    return newStr.trimEnd().split('\n').length <= 1 && (newStr.length - oldStr.length) <= 40;
  }

  // 4. Read transcript and collect edits
  const edits = []; // Array<{ path: string, tool: string, trivial: boolean }>
  const rl = createInterface({ input: createReadStream(transcript_path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Real transcript shape: assistant message wrapping content blocks
    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content) {
        if (block.type === 'tool_use' && EDIT_TOOLS.has(block.name)) {
          const p = block.input?.file_path ?? block.input?.path;
          if (p) edits.push({ path: p, tool: block.name, trivial: isTrivialEdit(block) });
        }
      }
    }

    // Legacy fallback: top-level tool_use (older transcript format)
    if (entry.type === 'tool_use' && EDIT_TOOLS.has(entry.name)) {
      const p = entry.input?.file_path ?? entry.input?.path;
      if (p) edits.push({ path: p, tool: entry.name, trivial: isTrivialEdit(entry) });
    }
  }

  // 5. Classify
  const isExcludedDir = (p) => EXCLUDE_DIRS.some(d => p.includes(`/${d}/`) || p.includes(`\\${d}\\`));
  const isTest     = (p) => TEST_PATTERNS.some(re => re.test(p));
  const isConfig   = (p) => CONFIG_PATTERNS.some(re => re.test(p));
  const isTypeOnly = (p) => TYPE_ONLY_PATTERNS.some(re => re.test(p));

  const sourceEdits = edits.filter(e =>
    !isExcludedDir(e.path) &&
    SOURCE_EXT.test(e.path) &&
    !isTest(e.path) &&
    !isConfig(e.path) &&
    !isTypeOnly(e.path),
  );

  const testEdited = edits.some(e =>
    !isExcludedDir(e.path) &&
    SOURCE_EXT.test(e.path) &&
    isTest(e.path),
  );

  const hasSubstantive = sourceEdits.some(e => !e.trivial);
  const uniqueSourcePaths = new Set(sourceEdits.map(e => e.path));

  // 6. Fire nudge only when source changed, no tests updated, and at least one substantive edit
  if (uniqueSourcePaths.size > 0 && !testEdited && hasSubstantive) {
    console.log(JSON.stringify({
      systemMessage: `🔍 Qualflare: ${uniqueSourcePaths.size} source file(s) changed without test updates. Run /qf-cover to add coverage.`,
    }));
  }
} catch {
  // exit silently on any error — hook must never crash
}

---
name: qf-update
description: >
  Refresh the file counts in .qualflare/test-state.md by re-globbing each
  framework row. Updates File count values and the Generated at timestamp
  in-place. Does not re-detect frameworks or change any other content.
  Use when the user runs /qf-update, asks to "refresh test counts", or after
  adding new test files without wanting to re-run full /qf-init.
allowed-tools: Read Edit Glob
---

## Step 1 — Read test state

Read `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`.

If the file does not exist, tell the user:
> "No Qualflare state file found. Run `/qf-init` first to set up the integration."

Stop here — do not proceed without the state file.

Parse the following:
- **`## Project`** section: extract the current `Generated at:` timestamp.
- **`## Packages`** table (if present): build a map of `path → qualflareProject`. If absent (legacy format), create a synthetic single entry: `{ path: "(root)", qualflareProject: <project name from ## Project> }`.
- **`## Frameworks in use`** table: read every row's `Package`, `Slug`, `File count`, and `Top-level paths` columns. If the table has no `Package` column (legacy format), treat all rows as belonging to `(root)`.

Build an update queue — one item per table row:
```
[{ package, slug, storedCount, topLevelPaths }]
```

**Filter via `$ARGUMENTS`** (same tie-breaker as other qf commands: `/` = package path, no `/` = slug):
- `$ARGUMENTS` contains `/` → keep only items whose `package` starts with that prefix.
- `$ARGUMENTS` is a single word without `/` → keep only items whose `slug` matches.
- `$ARGUMENTS` contains both a `/`-token and a word → apply both filters.
- `$ARGUMENTS` is empty → process all rows.

If the filtered queue is empty, tell the user:
> "No matching frameworks found for `<$ARGUMENTS>`. Run `/qf-state` to see available packages and slugs."

Stop here.

---

## Step 2 — Re-glob live file counts

Read the glob patterns from `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`. Locate the "Test-File Globs Per Slug" table and extract the patterns for each slug in the queue.

For each item in the queue, run Glob using each of that slug's patterns, scoped to the `Top-level paths` from the row. Exclude results under `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `.git/`, `__pycache__/`.

Sum the unique matches across all patterns for the slug. This is `liveCount`.

Record for each item: `{ package, slug, storedCount, liveCount, changed: liveCount !== storedCount }`.

---

## Step 3 — Apply updates to test-state.md

If **no items changed** (`changed === false` for all), tell the user:
> "File counts are already up to date — no changes needed."

Stop here.

For each item where `changed === true`, use the **Edit** tool to update its row in the `## Frameworks in use` table. Use the **exact raw line bytes read from the file in Step 1** as the `old_string` — do not reconstruct the row from parsed column values, as whitespace or path content may differ. Replace only the `File count` value in that row.

Example — if the row was:
```
| packages/web | jest | TypeScript | 42 | packages/web/src/**/*.test.ts |
```
and the live count is `47`, replace with:
```
| packages/web | jest | TypeScript | 47 | packages/web/src/**/*.test.ts |
```

Before making any edits, compute `newTimestamp` = current date and time in ISO 8601 format (e.g., `2026-04-21T10:30:00Z`). Use this single value for both the file edit and the Step 4 summary — do not recompute "now" a second time.

After updating all changed rows, also update the `Generated at:` line in the `## Project` section to `newTimestamp`.

---

## Step 4 — Print summary

```
Updated test-state.md file counts:

  jest (packages/web)         42 → 47  ✅
  playwright (packages/web)   18 → 18  (no change)
  golang (packages/api)       12 → 15  ✅

2 of 3 frameworks updated. Generated at: 2026-04-21T10:30:00Z
```

For single-package projects, omit the `(package)` suffix:
```
Updated test-state.md file counts:

  jest         42 → 47  ✅
  playwright   18 → 18  (no change)

1 of 2 frameworks updated. Generated at: 2026-04-21T10:30:00Z
```

If $ARGUMENTS scoped the run to a subset, note it:
```
Updated test-state.md file counts (jest only):

  jest   42 → 47  ✅

1 of 1 frameworks updated.
```

Always end with:
> "Run `/qf-doctor` to verify the full setup, or `/qf-run` to execute your tests."

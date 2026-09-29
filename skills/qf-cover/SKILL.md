---
name: qf-cover
description: >
  Propose and write new tests for source files changed in the current session.
  Detects which functions are already covered and only proposes tests for gaps.
  Use when the user runs /qf-cover, asks to "add test coverage", asks to
  "write tests", reacts to the Qualflare hook suggestion, or explicitly invokes
  this skill. Pass --all to cover an entire file/directory regardless of what changed.
argument-hint: "[--all] [optional file glob or path]"
allowed-tools: Read Write Edit Glob Bash(git diff:*) Bash(git status:*) Bash(grep:*)
---

You are executing the `qf-cover` skill. Follow every step below in order. Do not skip steps or reorder them.

---

## Step 1 — Read test state

Read the file at `${CLAUDE_PROJECT_DIR}/.qualflare/test-state.md`.

If the file does not exist, stop immediately and tell the user:

> "`.qualflare/test-state.md` not found. Run `/qf-init` first to set up Qualflare for this project."

Do not proceed past this step if the file is missing.

If the file exists, extract the following information:

- **Framework slugs in use**: parse the rows of the `## Frameworks in use` table — collect every value in the `Slug` column.
- **Naming conventions**: read the `## Conventions` section. Capture the value of `Test naming` (e.g., `*.test.ts`, `*_test.go`).
- **Project name**: read the `## Project` section and capture the `Name` field.
- **Package list**: parse the `## Packages` table — collect every row as `{ path, identifier }`. If the `## Packages` table is absent, stop and tell the user to run `/qf-init` to refresh the state file.

Keep all these values in memory for use in later steps.

**`--all` flag detection:** If `$ARGUMENTS` starts with `--all` (e.g., `/qf-cover --all` or `/qf-cover --all src/utils/`):
- Set an **allMode** flag to `true`.
- Strip `--all` from `$ARGUMENTS` and treat the remainder as the path/glob argument.
- `allMode` means: cover the entire file/directory scope, not just session-changed functions. When `allMode` is true, Step 4's function-level coverage check runs for ALL functions in each file (not just session-changed ones), and the area picker from the cold-start flow applies if more than 8 source files are in scope.

---

## Step 2 — Detect cold start

Before using `git diff`, check whether this project has **any** existing tests.

Use `Glob` with each of the following patterns and sum the total match count. Exclude any match whose path contains `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `.git/`, or `__pycache__/`.

- `**/*.test.{js,jsx,ts,tsx,mjs,cjs}`
- `**/*.spec.{js,jsx,ts,tsx,mjs,cjs}`
- `**/__tests__/**/*.{js,jsx,ts,tsx}`
- `**/*_test.go`
- `**/test_*.py`
- `**/*_test.py`
- `**/*_spec.rb`
- `**/tests/**/*Test.php`

**If the total count is > 0**: this project has existing tests. Skip ahead to Step 3 (changed-file flow).

**If the total count is 0**: cold start. Continue with the cold-start flow below.

### Cold-start flow

**If `$ARGUMENTS` is non-empty** (user ran e.g. `/qf-cover src/api/`): treat that argument as the working file list. Apply the Conditions 1–3 filter from Step 3 to the files under that path. Skip the area picker below and jump directly to Step 5 with that list.

**Otherwise** (no explicit path):

1. **Scan for source files.** Use `Glob` with pattern `**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,go,py,rb,php,rs,java,kt}`. Apply the Conditions 1–3 filter from Step 3 (exclude test files, excluded directories, config files, type-only files) to the results.

2. **Group by area.** For monorepos (package list has more than one entry), group by `<package-path>/<first-subdir-within-package>`. For single-package projects, group by the **first two directory segments under the first conventional source root** found in the path (`src/`, `lib/`, `internal/`, `app/`, `pkg/`). If the file has no conventional source root in its path, group it under `(root)`.

   Monorepo examples:
   - `packages/web/src/api/user.ts` → area `packages/web/src/`
   - `packages/api/internal/handlers/login.go` → area `packages/api/internal/`

   Single-package examples:
   - `src/api/user.ts` → area `src/api/`
   - `internal/handlers/login.go` → area `internal/handlers/`
   - `main.py` → area `(root)`

3. **If the total source file count is ≤ 8**: skip the area picker. Treat all source files as the working list and jump to Step 5.

4. **Otherwise, present the area overview** and wait for user input:

   ```
   No existing tests found. Let's bootstrap coverage one area at a time.

   Source areas (<total> files total):
   1. packages/web/src/     (15 files)
   2. packages/web/utils/   (8 files)
   3. packages/api/internal/ (22 files)

   Which areas should we cover in this round?
   - By number or name: "1, 3" or "web/src, api/internal"
   - Explicit files: "packages/web/src/user.ts packages/api/internal/auth.go"
   - Everything: "all" (not recommended unless the project is tiny)
   ```

5. **Parse the user's response:**
   - Numbers or area names → collect every source file in those areas.
   - Explicit file paths → use exactly those paths.
   - `all` → collect every source file across all areas.
   - `no`, `cancel`, or empty → stop without writing anything.

6. **Apply the per-round cap.** If the selected list contains **more than 8 files**, tell the user:

   > "That's \<N\> files — more than fits comfortably in one round. Please narrow further (pick fewer areas, or name specific files). I'll wait."

   Repeat from step 4 until the selected list is ≤ 8 files or the user cancels.

7. **Proceed to Step 5** with the narrowed working list. Skip Steps 3 and 4 — cold-start files are already known to have no tests.

---

## Step 3 — Find changed source files

> **Skip this step if you entered from Step 2's cold-start flow** — the working file list is already set.

Run both of the following commands and union their results into a single list of file paths:

```bash
git diff --name-only HEAD
git status --porcelain
```

**Parsing `git status --porcelain` output:**
Each line has a two-character status code followed by a space and then the filename. Lines whose status code contains `M`, `A`, `?` (including `MM`, `AM`, `??`, ` M`, ` A`) indicate modified or untracked files. Extract the filename starting at column 4 (0-indexed: characters from index 3 onward). Ignore lines starting with `D` (deleted) or `R` (renamed, handle only the new name after ` -> `).

After collecting all paths, apply the following filter. A file is a **source file needing tests** only if ALL of these conditions are true:

**Condition 1 — Extension is a source code extension:**
The file extension must be one of: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.go`, `.py`, `.rb`, `.php`, `.rs`, `.java`, `.kt`

**Condition 2 — Path does not match test-file patterns (all of these must be absent):**
- Filename matches `*.test.js`, `*.test.jsx`, `*.test.ts`, `*.test.tsx`, `*.test.mjs`, `*.test.cjs`
- Filename matches `*.spec.js`, `*.spec.jsx`, `*.spec.ts`, `*.spec.tsx`, `*.spec.mjs`, `*.spec.cjs`
- Path contains a `__tests__/` directory component anywhere
- Path contains an `e2e/` directory component anywhere
- Path contains a `playwright/` directory component anywhere
- Path contains a `cypress/` directory component anywhere
- Filename ends with `_test.go`
- Filename starts with `test_` and has a `.py` extension
- Filename ends with `_test.py`
- Filename ends with `_spec.rb`
- Filename ends with `Test.php`

**Condition 3 — Path does not contain excluded directory components:**
The path must NOT contain any of: `node_modules/`, `vendor/`, `dist/`, `build/`, `.git/`, `.next/`, `__pycache__/`

**Condition 4 — File is not a config or type-only file:**
Exclude the file if its basename (filename without directory) matches ANY of:
- Config patterns: `*.config.{js,jsx,ts,tsx,mjs,cjs,mts,cts,json}` (e.g., `vite.config.ts`, `jest.config.js`, `tsconfig.json`, `tailwind.config.cjs`)
- RC-file patterns: `.*rc.{js,ts,cjs,mjs,json,yaml,yml}` (e.g., `.eslintrc.js`, `.prettierrc.json`)
- Bare RC files (exact basenames): `.eslintrc`, `.prettierrc`, `.babelrc`, `.stylelintrc`
- Type-only patterns: `*.d.{ts,mts,cts}` (e.g., `globals.d.ts`), `types.{ts,tsx}` (exact basename), `*.types.{ts,tsx}` (e.g., `api.types.ts`)

**Package attribution:** For each file that passes Conditions 1–3, determine which package it belongs to by finding the longest-prefix match from the package list (from Step 1). For example, if the package list contains `packages/web` and `packages/api`, then `packages/web/src/user.ts` belongs to `packages/web`. Files with no matching package prefix fall under `(root)` only if `(root)` is in the package list; otherwise they are reported as orphaned (warn the user but do not process them further).

**Filtering by `$ARGUMENTS`** (after stripping `--all` if present — tie-breaker: any value containing `/` is a package path; anything else is a file glob):
- If `$ARGUMENTS` contains `/` and matches a package path from the package list → filter to files belonging only to that package.
- If `$ARGUMENTS` contains `/` but does not match a package path → treat as a file glob pattern and filter files whose path matches.
- If `$ARGUMENTS` is a single word without `/` → treat as a file glob pattern.
- If `$ARGUMENTS` is empty → no additional filtering.

**`allMode` source collection:** When `allMode` is true, skip `git diff` / `git status` entirely. Instead, use `Glob` with source-extension patterns (`**/*.{ts,tsx,js,jsx,go,py,rb,php,rs,java,kt}`) scoped to the path from `$ARGUMENTS` (or the whole project if `$ARGUMENTS` is empty). Apply Conditions 1–3 to the results. If more than 8 files are collected, apply the same area-picker flow as the cold-start path in Step 2 before proceeding.

**If no source files remain after filtering**, tell the user:

> "No untested source files found in the current changes. Great — coverage looks good!"

Then stop.

---

## Step 4 — Analyze coverage per file

> **Skip this step if you entered from Step 2's cold-start flow** — the working file list is already known to be untested. Jump straight to Step 5 with all functions marked as uncovered.

For each source file that passed the Step 3 filter, run the two sub-steps below.

### 4a — Locate an existing test file

Use the `Glob` tool to probe the paths below. A test file is considered found if ANY match is found.

For a source file at `<dir>/<base>.<ext>`:

**Co-located (same directory):**
- `<dir>/<base>.test.<ext>` (e.g., `src/utils/formatter.test.ts`)
- `<dir>/<base>.spec.<ext>` (e.g., `src/utils/formatter.spec.ts`)
- `<dir>/__tests__/<base>.<ext>` (e.g., `src/utils/__tests__/formatter.ts`)
- **Go only**: `<dir>/<base>_test.go`
- **Python only**: `<dir>/test_<base>.py` or `<dir>/<base>_test.py`

**Top-level test trees (centralized layouts):**
- `tests/**/<base>.test.<ext>` and `tests/**/<base>.spec.<ext>`
- `tests/**/test_<base>.py` and `tests/**/<base>_test.py`
- `tests/**/<base>Test.php`
- `spec/**/<base>_spec.rb`
- `e2e/**/<base>.spec.<ext>` and `e2e/**/<base>.cy.<ext>`
- `playwright/**/<base>.spec.<ext>`
- `cypress/e2e/**/<base>.cy.<ext>`

**Mirror-tree layout** (if source path starts with `src/`):
- Let `<rest>` = path segments after `src/`. Also check:
  - `tests/<rest>/<base>.test.<ext>`
  - `__tests__/<rest>/<base>.<ext>`

**If NO test file is found:** mark the source file as "no coverage" — all functions need tests. Skip 4b and proceed to the next file.

### 4b — Function-level coverage analysis (only when a test file exists)

1. **Read the source file.** Extract the names of all testable units using language-specific heuristics:
   - **TypeScript/JS**: `export function <name>`, `export const <name> =`, `export class <name>`, `export async function <name>`, `export default function <name>`. Exclude type aliases, interfaces, and enums.
   - **Go**: Top-level functions whose name starts with an uppercase letter: `func [A-Z]\w+(`. Exclude `main` and `init`.
   - **Python**: Module-level `def` functions and class methods not starting with `_`. Exclude `__dunder__` methods.
   - **Ruby**: `def` methods not starting with `_`. Include class methods (`def self.<name>`).
   - **PHP**: `public function \w+` and `public static function \w+`.
   - **Java/Kotlin**: `public` methods (non-constructor).

   Count the total: **M functions**.

2. **Read the existing test file.** For each function name from step 1, check whether that name appears as a substring anywhere in the test file content. A function is considered **covered** if its name is found.

   **False-negative risk:** Short or common names (e.g., `validate`, `parse`, `get`) may match incidentally — `validate` hits `invalidate`, `validateToken`, or even a string literal `"validate"`. When a function name is 6 characters or fewer, or is a common English word, err on the side of inclusion: mark it as **uncovered** and include it in proposals rather than silently skipping it. A small false positive (proposing a test that already exists) is cheaper than a missed gap.

   Count the covered: **N functions covered**.

3. **Compute coverage gap:** Record `coveredCount = N`, `totalCount = M`, `uncoveredFunctions = [names not found in test file]`.

4. **Decision:**
   - If `uncoveredFunctions` is empty (N === M): this file is fully covered. Remove it from the working list.
   - If `uncoveredFunctions` is non-empty: keep it in the working list. Attach the coverage metadata so Step 5 knows which functions to target.

### 4c — Summary after analysis

After analyzing all files, if ALL files were removed (fully covered), tell the user:

> "All changed source files already have tests for every exported function. Nicely done!"

If `allMode` is true and all files are fully covered, say:

> "Full coverage detected — every exported function in the selected scope has a corresponding test."

Then stop.

Otherwise, continue to Step 5 with only the files that have uncovered functions. Each file carries its coverage metadata: `{ file, testFile: path|null, coveredCount, totalCount, uncoveredFunctions[] }`.

---

## Step 5 — Read source files and propose tests

For each source file in the working list, do the following in order:

1. **Read the source file** using the Read tool (skip if already read in Step 4).

2. **Determine the target function set:**
   - If the file has no test file (`testFile === null`): all functions are targets.
   - If the file has a test file: only the `uncoveredFunctions` list from Step 4 are targets. Do NOT propose tests for already-covered functions.

3. **Rank targets by importance** before proposing:
   - **Tier 1 — Public API**: exported or public functions/methods. Propose these first.
   - **Tier 2 — Complex internals**: non-exported functions that contain conditionals, loops, error handling, or more than ~10 lines of logic.
   - **Tier 3 — Simple helpers**: trivial private functions (single expression, no branches). Propose these last; it is acceptable to omit Tier 3 functions when they are clearly wrappers with no meaningful behavior to test.

4. **Propose 2–5 test cases per function** based on complexity. For each target function, the proposal must include:
   - A happy path test for the main behavior
   - At least one edge case (empty input, null/nil/undefined, boundary value)
   - An error or exception case if the function contains error handling

5. **Show the coverage gap header** above each file's proposals:
   - If the file has a test file: show the gap fraction. Example: `src/utils/formatter.ts — 2/5 functions covered, 3 uncovered`
   - If the file has no test file: show `src/utils/formatter.ts — no tests yet`

6. **Format the proposals.** When the working list contains files from **more than one package**, group by package:

   ```
   Proposed tests for packages/web:

     src/utils/formatter.ts — 2/5 functions covered, 3 uncovered
       [Tier 1 – Public API]
       1. formatCurrency() with a positive number returns "$1,234.56"
       2. formatCurrency() with zero returns "$0.00"
       3. formatCurrency() with a negative number returns "-$1.00"
       [Tier 2 – Complex internals]
       4. parseLocale() with unsupported locale falls back to "en-US"
       5. parseLocale() with null throws TypeError

   Proposed tests for packages/api:

     internal/auth/token.go — no tests yet
       [Tier 1 – Public API]
       1. ValidateToken returns nil error for a valid token
       2. ValidateToken returns ErrExpired for an expired token
       3. ValidateToken returns ErrMalformed for an empty string
   ```

   When all files belong to a **single package** (including `(root)`), use the flat format without package headers:

   ```
   src/utils/formatter.ts — 2/5 functions covered, 3 uncovered
   [Tier 1 – Public API]
   1. formatDate() with a valid Date returns correct ISO string
   2. formatDate() with null throws TypeError
   [Tier 2 – Complex internals]
   3. formatDate() with epoch 0 returns "1970-01-01T00:00:00.000Z"
   ```

7. Repeat for every source file in the working list.

After listing all proposals, print a one-line summary:

> "**Summary:** \<N\> file(s) across \<P\> package(s) · \<M\> test cases proposed · \<covered\>/\<total\> functions already covered"

For single-package projects:

> "**Summary:** \<N\> file(s) · \<M\> test cases proposed · \<covered\>/\<total\> functions already covered"

Omit the "already covered" portion when no test files exist yet (cold start or `testFile === null` for all files).

Then ask:

> "Shall I write these tests? Reply 'all' or 'yes' to write everything, 'skip \<filename\>' to exclude specific files, or 'no' to cancel."

Wait for user input before proceeding. Do not write any test files until the user responds.

Process the response as follows:
- `all` or `yes` or `y`: proceed with writing tests for all proposed files.
- `skip <filename>`: remove that file from the write list. If the user provides multiple skip instructions, apply all of them.
- If the user names specific files to include, write only those files.
- If the user declines or says `no` / `n`, stop without writing any files.

---

## Step 6 — Write approved tests

For each approved source file, write the test file. Follow these rules:

**File location and naming:**
Use the naming convention from `.qualflare/test-state.md` (`## Conventions → Test naming`). If no convention is recorded, infer one by searching for existing test files in the project (e.g., look for `*.test.ts` or `*_test.go` patterns). If still ambiguous, place the test file co-located with the source file using the `<base>.test.<ext>` pattern.

**Framework selection:**
Choose the framework based on the slugs extracted in Step 1 and the source file's language. For monorepos, use the slug recorded for that file's package in `## Frameworks in use`.

- **`jest`** (TypeScript/JavaScript): Write using `describe`/`it`/`expect` syntax. If the project uses vitest (check for `vitest` in `package.json` devDependencies), import from `vitest` instead of `@jest/globals`. Otherwise use jest imports. Use ES module imports (`import { ... } from '../<source>.js'`). For TypeScript, preserve types in assertions.
- **`playwright`** (TypeScript/JavaScript, E2E): Write using `test`/`expect` blocks with `@playwright/test` imports. Only generate Playwright tests if the source file is clearly a page/component, not a utility.
- **`pytest`** (Python): Write using `def test_<name>():` functions. Group related tests in a class prefixed with `Test`. Import the module under test at the top.
- **`golang`** (Go): Write using `func Test<Name>(t *testing.T)` functions inside a `_test` package. Import `testing` and the package under test.
- **`rspec`** (Ruby): Write using `describe`/`it` blocks with `RSpec.describe`. Require the file under test at the top.
- **`phpunit`** (PHP): Write a class extending `PHPUnit\Framework\TestCase`. Use `setUp`/`tearDown` where appropriate.
- **`junit`** or **`testng`** (Java/Kotlin): Write a class with `@Test`-annotated methods. Import the relevant annotations at the top.

**General rules for writing tests:**
- Always include the necessary import/require statements or package declarations at the top of the test file.
- Include a brief comment above each test case describing what it verifies.
- Do not add mocking infrastructure unless the source file clearly depends on external services — keep tests simple and focused.
- Prefer testing behavior (inputs and outputs) over implementation details.
- Write all test cases from the approved proposal. Do not add extra tests beyond what was proposed and approved.

**Append vs create:**
- If `testFile === null` (no existing test file): use the `Write` tool to create a new file at the determined path.
- If `testFile` exists (partial coverage): use the `Edit` tool to append the new test cases to the end of the existing file, inside the same `describe` block if one exists, or as new top-level test functions if the file uses a flat structure. Do NOT rewrite or remove any existing tests.

---

## Step 7 — Refresh file counts and suggest next step

After writing test files, silently update the file counts in `${CLAUDE_PROJECT_DIR}/.qualflare/test-state.md` for each (package, slug) pair touched in Step 6.

For each touched (package, slug):

1. Read the glob patterns for the slug from `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`. Locate the "Test-File Globs Per Slug" table and extract the patterns for this slug.
2. Run Glob using those patterns, scoped to the `Top-level paths` from the matching row in `## Frameworks in use`. Exclude results under `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `.git/`, `__pycache__/`.
3. Count unique matches. Use the Edit tool to update the `File count` value in that row — use the **exact raw line bytes from the file** as `old_string`, replacing only the count number.

After updating all touched rows, also update the `Generated at:` line in the `## Project` section to the current ISO 8601 timestamp.

Do this silently — no output about the count changes. Then tell the user:

> "Tests written. Run `/qf-run` to execute them, then `/qf-fix` if any fail."

---

## Edge cases

- **`$ARGUMENTS` is empty**: Process all changed source files without additional path filtering (Step 3 still applies).
- **`--all` with no path** (e.g., `/qf-cover --all`): Collect all source files in the project root. Apply the area-picker flow if > 8 files. Useful for bootstrapping coverage on an existing codebase.
- **`--all` with a path** (e.g., `/qf-cover --all src/utils/`): Scope the glob to that path. If ≤ 8 files are found, skip the area picker and go straight to Step 4.
- **Function already covered but logic changed**: The heuristic (function name appears in test file) may produce false positives when a function was renamed. When in doubt, include the function in proposals — a small false positive is better than a missed gap.
- **Source file is a configuration or type-only file**: Already excluded by Condition 4 in Step 3. No additional handling needed.
- **Multiple frameworks detected for the same language**: Prefer the framework whose config file is present at the project root. If still ambiguous, ask the user which framework to use before writing any test files.
- **No naming convention in test-state.md**: Search the project for two or three existing test files using the Read tool on likely paths, infer the convention from those files, and use it. If no existing test files are found, default to `<base>.test.<ext>` co-located with the source.
- **User says 'skip' for all files**: Acknowledge the skips and stop without writing anything. Do not suggest further actions.
- **Read tool returns an error** for a source file (e.g., file was deleted after `git diff` ran): Skip that file silently and proceed with the remaining files.
- **Dry-run context**: If the session context indicates a dry-run mode, log what would be written but do not call Write or Edit. Report each file path and a summary of its test cases.
- **Cold-start project with ≤ 8 source files total**: Skip the area picker — just treat all source files as the working list and proceed directly to Step 5.
- **Cold-start user selects an area whose file count is > 8**: Apply the per-round cap and prompt to narrow further. Do not silently truncate the list.
- **Cold-start with unusual source layout** (e.g., `packages/*/src/`): All such files fall back to the `(root)` area group. If everything lands in `(root)`, list files individually instead of areas so the user can choose meaningfully.
- **Changed file belongs to no package** (no prefix match): Warn the user that the file is outside any known package and skip it. Prompt them to re-run `/qf-init` if the package list is outdated.
- **Monorepo with files in multiple packages**: Group proposals by package in Step 5. Each group reads and proposes tests for its own files only.

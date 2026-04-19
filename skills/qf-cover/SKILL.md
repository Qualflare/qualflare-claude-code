---
name: qf-cover
description: >
  Propose and write new tests for source files changed in the current session.
  Use when the user runs /qf-cover, asks to "add test coverage", asks to
  "write tests", reacts to the Qualflare hook suggestion, or explicitly invokes
  this skill.
allowed-tools: Read Write Edit Glob Bash(git diff:*) Bash(git status:*)
---

You are executing the `qf-cover` skill. Follow every step below in order. Do not skip steps or reorder them.

---

## Step 1 — Read test state

Read the file at `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`.

If the file does not exist, stop immediately and tell the user:

> "`.qualflare/test-state.md` not found. Run `/qf-init` first to set up Qualflare for this project."

Do not proceed past this step if the file is missing.

If the file exists, extract the following information:

- **Framework slugs in use**: parse the rows of the `## Frameworks in use` table — collect every value in the `Slug` column.
- **Naming conventions**: read the `## Conventions` section. Capture the value of `Test naming` (e.g., `*.test.ts`, `*_test.go`).
- **Project name**: read the `## Project` section and capture the `Name` field.

Keep these values in memory for use in later steps.

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

2. **Group by area.** For each source file, determine its area as the **first two directory segments under the first conventional source root** found in the path (`src/`, `lib/`, `internal/`, `app/`, `pkg/`). If the file has no conventional source root in its path, group it under `(root)`.

   - `src/api/user.ts` → area `src/api/`
   - `internal/handlers/login.go` → area `internal/handlers/`
   - `main.py` → area `(root)`

3. **If the total source file count is ≤ 8**: skip the area picker. Treat all source files as the working list and jump to Step 5.

4. **Otherwise, present the area overview** and wait for user input:

   ```
   No existing tests found. Let's bootstrap coverage one area at a time.

   Source areas (<total> files total):
   1. src/api/         (15 files)
   2. src/services/    (22 files)
   3. src/utils/       (8 files)
   4. src/components/  (37 files)
   5. src/hooks/       (5 files)

   Which areas should we cover in this round?
   - By number or name: "1, 3" or "api, utils"
   - Explicit files: "src/api/user.ts src/api/auth.ts"
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

**Filtering by `$ARGUMENTS`:**
If the `$ARGUMENTS` variable is non-empty and contains a file glob or path, further filter the list to include only files whose path matches that pattern. Treat the argument as a glob pattern.

**If no source files remain after filtering**, tell the user:

> "No untested source files found in the current changes. Great — coverage looks good!"

Then stop.

---

## Step 4 — Check for co-located tests

> **Skip this step if you entered from Step 2's cold-start flow** — the working file list is already known to be untested.

For each source file that passed the Step 3 filter, check whether a co-located test file already exists. Use the Read tool to probe for each candidate path below. A co-located test is considered present if ANY of the following paths exists:

For a source file at `<dir>/<base>.<ext>`:

- `<dir>/<base>.test.<ext>` (e.g., `src/utils/formatter.test.ts`)
- `<dir>/<base>.spec.<ext>` (e.g., `src/utils/formatter.spec.ts`)
- `<dir>/__tests__/<base>.<ext>` (e.g., `src/utils/__tests__/formatter.ts`)
- **Go only** (`_test.go` convention): `<dir>/<base>_test.go`
- **Python only**: `<dir>/test_<base>.py` or `<dir>/<base>_test.py`

If ALL source files in the list already have a co-located test, tell the user:

> "All changed source files have co-located tests. Nicely done!"

Then stop.

Remove from the working list any source file that already has a co-located test. Continue with only the files that lack tests.

---

## Step 5 — Read source files and propose tests

For each source file without a co-located test, do the following in order:

1. **Read the source file** using the Read tool.

2. **Analyze the file** to identify:
   - Exported functions, classes, or public methods (the primary API surface)
   - Key logic branches (conditionals, loops, early returns, error paths)
   - Edge cases visible from the code (empty inputs, nulls, zero values, boundary values)

3. **Propose 2–5 test cases** based on complexity. Every proposal must include:
   - A happy path test for the main function or class behavior
   - At least one edge case (empty input, null/nil/undefined, boundary value)
   - An error or exception case if the code contains error handling

4. **Format the proposal** as a numbered list under a header for that file:

   ```
   Proposed tests for src/utils/formatter.ts:
   1. formatDate() with a valid Date returns correct ISO string
   2. formatDate() with null throws TypeError
   3. formatDate() with epoch 0 returns "1970-01-01T00:00:00.000Z"
   ```

5. Repeat for every source file without a test.

After listing all proposals, ask the user:

> "Shall I write these tests? You can also say 'skip <filename>' to exclude specific files, or 'all' to proceed with all of them."

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
Choose the framework based on the slugs extracted in Step 1 and the source file's language:

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

Use the Write tool to create each test file at the determined path.

---

## Step 7 — Suggest next step

After all approved test files have been written, tell the user:

> "Tests written. Run `/qf-run` to execute them and upload results to Qualflare."

---

## Edge cases

- **`$ARGUMENTS` is empty**: Process all changed source files without additional path filtering (Step 3 still applies).
- **Source file is a configuration file** (e.g., `vite.config.ts`, `jest.config.ts`, `next.config.js`): Exclude it from the list — configuration files do not need unit tests. Add this exclusion in Step 3 by checking if the filename contains `config` or `setup` as a whole word segment.
- **Source file is a type definition only** (e.g., `types.ts`, `*.d.ts`): Exclude it — type-only files have no runtime behavior to test.
- **Multiple frameworks detected for the same language**: Prefer the framework whose config file is present at the project root. If still ambiguous, ask the user which framework to use before writing any test files.
- **No naming convention in test-state.md**: Search the project for two or three existing test files using the Read tool on likely paths, infer the convention from those files, and use it. If no existing test files are found, default to `<base>.test.<ext>` co-located with the source.
- **User says 'skip' for all files**: Acknowledge the skips and stop without writing anything. Do not suggest further actions.
- **Read tool returns an error** for a source file (e.g., file was deleted after `git diff` ran): Skip that file silently and proceed with the remaining files.
- **Dry-run context**: If the session context indicates a dry-run mode, log what would be written but do not call Write or Edit. Report each file path and a summary of its test cases.
- **Cold-start project with ≤ 8 source files total**: Skip the area picker — just treat all source files as the working list and proceed directly to Step 5.
- **Cold-start user selects an area whose file count is > 8**: Apply the per-round cap and prompt to narrow further. Do not silently truncate the list.
- **Cold-start with unusual source layout** (e.g., `packages/*/src/`): All such files fall back to the `(root)` area group. If everything lands in `(root)`, list files individually instead of areas so the user can choose meaningfully.

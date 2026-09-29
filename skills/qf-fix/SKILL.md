---
name: qf-fix
description: >
  Analyze failing tests from the last /qf-run and fix the source code to make
  them pass. Use when the user runs /qf-fix, asks to "fix failing tests", or
  asks to "fix test failures". Requires result files from a prior /qf-run.
argument-hint: "[framework-slug or package/path]"
allowed-tools: Read Edit Glob Bash(qf:*) Bash(npx:*) Bash(go test:*) Bash(pytest:*) Bash(cd:*) Bash(node:*) Bash(mkdir:*) Bash(cp:*) Bash(grep:*) Bash(npm:*) Bash(pnpm:*) Bash(yarn:*) Bash(jest:*) Bash(vitest:*) Bash(playwright:*) Bash(cypress:*) Bash(bundle:*) Bash(rspec:*) Bash(phpunit:*) Bash(mvn:*) Bash(gradle:*)
---

## Step 1 — Read state and locate result files

Read `${CLAUDE_PROJECT_DIR}/.qualflare/test-state.md`.

If the file does not exist, tell the user:
> "No Qualflare state file found. Please run `/qf-init` first to set up the integration."

Stop here — do not proceed without the state file.

**Parse `## Packages` table**: build a map of `path → identifier` from the `Path` and `Identifier` columns. If the `## Packages` table is absent, stop and tell the user to run `/qf-init` to refresh the state file.

**Parse `## Frameworks in use` table**: read every row's `Package`, `Slug`, and `Top-level paths` columns.

**Build the per-package work queue** — one item per (Package, Slug) row:
```
[{ package, identifier, slug, cwd }]
```
Where `cwd` = `${CLAUDE_PROJECT_DIR}` for `(root)`, or `${CLAUDE_PROJECT_DIR}/<package-path>` for named packages.

**Filter via `$ARGUMENTS`** (tie-breaker: any value containing `/` is a package path; anything else is a slug):
- `$ARGUMENTS` contains `/` → keep only items whose `package` starts with that prefix.
- `$ARGUMENTS` is a single word without `/` → keep only items whose `slug` matches.
- `$ARGUMENTS` contains both a `/`-containing token and a separate word (e.g., `packages/web jest`) → apply both: filter by package path AND by slug.
- `$ARGUMENTS` is empty → no filtering; process the full queue.

**Locate results:** For each queue item, check whether its result path from the last `/qf-run` exists. `<R>` is `${CLAUDE_PROJECT_DIR}/.qualflare/results/<package-dir>`, where `<package-dir>` is `root` for `(root)` or the package path verbatim (e.g., `packages/web`). These paths and formats must match `/qf-run` Step 2:

| Slug | Result path | Format |
|------|-------------|--------|
| `jest` | `<R>/jest.json` | Jest/Vitest JSON |
| `golang` | `<R>/golang.json` | `go test -json` (NDJSON) |
| `mocha` | `<R>/mocha.json` | Mocha JSON reporter |
| `playwright` | `<R>/playwright.json` | Playwright JSON reporter |
| `cypress` | `<R>/cypress/*.json` | Mochawesome JSON, one file per spec |
| `rspec` | `<R>/rspec.json` | RSpec JSON formatter |
| `cucumber` | `<R>/cucumber.json` | Cucumber JSON |
| `python`, `phpunit` | `<R>/<slug>.xml` | JUnit XML |
| `junit` | `<R>/junit/*.xml` | JUnit XML, one file per test class |

For the two directory rows, the item's result files are every matching file in the directory; the item exists only if at least one file matches.

Remove from the queue any items whose results do not exist. If the entire queue has no results, tell the user:
> "No result files found. Run `/qf-run` first to generate test results, then re-run `/qf-fix`."

Stop here.

**Validate result files (pre-flight):** `qf validate` parses files locally. It never calls the API and needs no `qf login`, so a missing or rejected token must never stop `/qf-fix`. For each item remaining in the queue, run it on the item's result files:

```bash
qf validate --format <slug> <result-file> [<result-file> ...]
```

Read the output, not just the exit code, because every failure exits 1:

- **Exit 0:** the files are valid — proceed normally.
- **Non-zero and the output has a line containing `: invalid - `** (the CLI prints one `<file>: invalid - <reason>` line per file it could not parse): the file itself is bad. Warn the user: "Result file for `<slug>` (<package>) failed validation: `<reason>`. Re-run `/qf-run` to regenerate, then try `/qf-fix` again." Remove the item from the queue.
- **Non-zero with no such line** — for example exit 127 (`qf` not installed), `Error: unsupported format: <slug>` (the installed CLI predates this slug), or `Error: no identifier "validate" configured` (a CLI release older than the login-free `qf validate`): this is a CLI problem, not a bad result file. Keep every item in the queue, skip validation for the rest of this run, and tell the user once: "Skipped result-file validation — `qf validate` is unavailable (`<first stderr line>`). Upgrade the Qualflare CLI to enable it." Continue with the in-skill parsing below.

If the queue is empty after validation, stop.

---

## Step 2 — Parse failures from result files

For each item in the queue, read its result file and extract all failing tests.

**jest / vitest (JSON format):**

The top-level object has a `testResults` array (Jest `--json` and Vitest `--reporter=json` write the same shape). Each element is one test file:
- `name` — absolute path to the test file
- `assertionResults` — array of individual test cases, each with `status`, `ancestorTitles`, `title` and `failureMessages`
- `status` and `message` — the file's own status; a file that failed to load (syntax error, missing import) has `status === "failed"`, a non-empty `message` and no failing `assertionResults`

For each entry of `assertionResults` where `status === "failed"`:
```
{
  package,
  slug,
  testFile: testResults[i].name,
  testName: [...ancestorTitles, title].join(' > '),
  errorMessage: failureMessages[0] (first failure message, truncated to first 20 lines)
}
```

For a file with `status === "failed"` and no failed `assertionResults`, record one failure with `testName: "(test file failed to run)"` and `errorMessage: message` (first 20 lines).

**golang (NDJSON format):**

Parsing requires two passes over the file:
- **Pass 1**: collect the set of failing test names — all lines where `Action === "fail"` AND `Test` is non-empty.
- **Pass 2**: for each failing test name, collect all lines where `Action === "output"` AND `Test` matches that name — these are the stack trace / error lines, and they appear throughout the file before the corresponding `Action:"fail"` line.

For each failing test:
```
{
  package,
  slug,
  testName: entry.Test,
  goPackage: entry.Package,
  errorOutput: (all output lines for this test joined, first 20 lines)
}
```

**mocha (Mocha JSON reporter):**

The top-level object has a `failures` array. For each element:
```
{
  package,
  slug,
  testFile: file,
  testName: fullTitle,
  errorMessage: err.message + err.stack (first 20 lines)
}
```

**playwright (Playwright JSON reporter):**

`suites` is a tree: each suite has `specs` and nested `suites`. Walk it recursively. For each spec, look at every entry in `tests`; the test failed when its `status` is `unexpected`, or when the last element of `results` has `status` `failed` or `timedOut`.
```
{
  package,
  slug,
  testFile: spec.file (relative to the config's rootDir),
  testName: [...suite titles, spec.title].join(' > '),
  errorMessage: the failing result's errors[0].message, or error.message (first 20 lines)
}
```

**cypress (Mochawesome JSON, one file per spec):** read every JSON file in the directory. Each file has a `results` array; each result has `fullFile` (the spec path) and a `suites` tree (each suite has `tests` and nested `suites`). For each test where `fail === true`:
```
{
  package,
  slug,
  testFile: result.fullFile,
  testName: test.fullTitle,
  errorMessage: test.err.message + test.err.estack (first 20 lines)
}
```

**rspec (RSpec JSON formatter):** the top-level object has an `examples` array. For each example where `status === "failed"`:
```
{
  package,
  slug,
  testFile: file_path,
  line: line_number,
  testName: full_description,
  errorMessage: exception.message + exception.backtrace (first 20 lines)
}
```

**cucumber (Cucumber JSON):** the top level is an array of features, each with a `uri` and `elements` (scenarios). A scenario failed when any of its `steps` has `result.status === "failed"`:
```
{
  package,
  slug,
  testFile: feature.uri,
  testName: feature.name + ' > ' + scenario.name,
  failingStep: the failed step's keyword + name, and its match.location (the step definition),
  errorMessage: the failed step's result.error_message (first 20 lines)
}
```

**JUnit XML format** (python, phpunit, junit — for `junit`, every file in the directory):

Parse the XML structure. Find all `<testcase>` elements that contain a `<failure>` or `<error>` child.

For each failing testcase:
```
{
  package,
  slug,
  testName: testcase @name attribute,
  classname: testcase @classname attribute (dotted module path in pytest, fully qualified class in JUnit),
  testFile: testcase @file attribute when present (phpunit),
  errorMessage: failure element @message attribute + text content (first 20 lines)
}
```

**Aggregate:** Collect all extracted failures into a flat list. Deduplicate by (package + slug + testName).

If the list is empty, tell the user:
> "No failures found in the last run results. All tests are passing! Run `/qf-run` to refresh results."

Stop here.

---

## Step 3 — Present failures and confirm scope

Display all failures in a readable format:

**Single-package format:**
```
Found N failing tests:

  jest
    1. src/utils/formatter.test.ts > formatDate › with invalid input
       Expected: "N/A"
       Received: "Invalid Date"

    2. src/auth/token.test.ts > validateToken › with expired token
       Error: Expected token.isValid to be false

  golang
    3. TestToken_Expired (internal/auth)
       panic: runtime error: index out of range

```

**Multi-package format** (group by package):
```
Found N failing tests:

  packages/web (jest)
    1. src/utils/formatter.test.ts > formatDate › with invalid input
       ...

  packages/api (golang)
    2. TestToken_Expired
       ...
```

Then ask:
> "Fix all N failures? (Press Enter to fix all, or list numbers to skip, e.g. `skip 2,3`)"

Accept any variant of:
- Empty / Enter / "all" / "yes" → fix all failures
- "skip N,M" / "only N,M" → fix the specified subset
- A test name substring → fix only failures whose name contains that substring

Proceed with the confirmed set. If the set is empty, stop.

---

## Step 4 — Locate and fix each failure

Process failures one at a time. For each failure:

### 4a — Locate the source file

**From Jest failures:**
1. Read the test file (from `testFile` field).
2. Scan `errorMessage` for stack frames matching: `at .+ \((.+\.(?:[mc]?[jt]sx?)):(\d+):\d+\)` — the first non-test-framework frame points to the source file under test.
3. If no stack frame found, infer: remove `.test.` or `.spec.` from the test filename to get the source file (e.g., `src/utils/formatter.test.ts` → `src/utils/formatter.ts`). Use Glob to confirm it exists.

**From Go failures:**
1. The test name is `TestXxx` or `TestXxx/subtest`. Use Grep to find the test function: `func <TestName>` in `*_test.go` files scoped to the package directory.
2. Read the test file to understand what it's testing (what functions/methods it calls on what types).
3. The source is the non-test file in the same package directory (e.g., if `auth_test.go` tests `ValidateToken`, look for `validate_token` or `token.go` in the same dir).

**From mocha, playwright, cypress, rspec and cucumber failures:**
1. The test file is in `testFile` (for rspec also `line`). Read it.
2. Scan `errorMessage` for stack frames pointing into non-test source files, as for Jest. For cucumber, the failing step's `match.location` names the step definition; the code under test is what that step definition calls.
3. Fall back to Grep if the source file is unclear.

**From JUnit XML (pytest, phpunit, junit):**
1. **pytest:** `classname` is the dotted module path, plus the class for tests in a class (`tests.test_auth` or `tests.test_auth.TestLogin`) — there is no `::`. The failure text names the file and line (`tests/test_auth.py:4: AssertionError`); use that. Otherwise turn dots into `/` and try `<classname>.py`, then again without the last segment.
2. **phpunit:** each `<testcase>` has `file` and `line` attributes — the test file and the test method's line.
3. **junit:** `classname` is the fully qualified class name (`com.acme.FooTest` → `src/test/java/com/acme/FooTest.java`, or under the module the report came from).
4. Fall back to Grep if the file path is unclear.

### 4b — Read and understand

Read:
1. The **test file** (or the relevant test case within it) — understand what the test expects.
2. The **source file** — understand the current implementation.

Hold in mind: what does the test expect? What does the source currently produce? Why is there a mismatch?

### 4c — Decide: fix source or skip

Fix the **source file** (not the test file) unless:
- The test assertion is clearly wrong (e.g., expects an impossible value, has a typo in expected output). In that case, note it and skip with a message: "Test `<name>` appears to have an incorrect assertion — fix the test manually."
- The source file cannot be located despite the steps above. Skip with: "Could not locate source file for `<name>` — skipping."

### 4d — Apply the minimal fix

Use the Edit tool to make the smallest change that makes the test pass. Do not:
- Rewrite entire functions
- Add error handling for unrelated cases
- Refactor surrounding code
- Remove the failing assertion from the test

After the edit, note the change for the summary: `{ testName, sourceFile, lineEdited }`.

---

## Step 5 — Re-run to verify

After all edits are applied, re-run the affected frameworks to confirm the fixes work.

For each (package, slug) that had at least one fix applied:

Re-run using the same commands as `/qf-run` Step 2, writing to the same result path — including the step that first removes the previous result file or directory, so a runner that crashes before writing cannot leave the old failures in place to be read as this run's.

**Vitest note:** When `slug === "jest"`, first check whether the project's `package.json` contains `"vitest"` in `devDependencies` or `dependencies`. If yes, use `npx vitest run` instead of `npx jest` — vitest projects store results under the `jest` slug (mapped at init time) but require the vitest runner.

Parse the new result file using the same logic as Step 2. Determine for each previously-failing test whether it now passes.

**If all previously-failing tests now pass for a given framework:** report ✅.

**If some still fail:** report ❌ with the updated error message. Do not attempt a second automatic fix pass — instead tell the user:
> "N test(s) still failing after the fix attempt. Review the remaining errors above and re-run `/qf-fix` for another pass, or fix manually."

---

## Step 6 — Print summary

```
Fix complete:

  ✅ formatDate › with invalid input    src/utils/formatter.ts:47
  ✅ validateToken › expired token      src/auth/token.ts:23
  ❌ TestToken_Complex                  could not locate source file

Re-ran:
  jest (packages/web)      — 2 fixed, 0 still failing  ✅
  golang (packages/api)   — 0 fixed, 1 still failing  ❌

Next:
  /qf-run     — re-run full suite and upload results
  /qf-fix     — another pass on remaining failures
```

Omit the "still failing" line and the ❌ next-step hint when all failures were fixed.

---
name: qf-run
description: >
  Run the project's test suite and upload results to Qualflare. Use when the
  user runs /qf-run, asks to "run tests and report", asks to "run tests
  and upload", or explicitly invokes this skill after writing tests.
allowed-tools: Read Bash(qf:*) Bash(mkdir:*) Bash(npm:*) Bash(pnpm:*) Bash(yarn:*) Bash(go test:*) Bash(python:*) Bash(pytest:*) Bash(jest:*) Bash(vitest:*) Bash(playwright:*) Bash(cypress:*) Bash(bundle:*) Bash(rspec:*) Bash(phpunit:*) Bash(mvn:*) Bash(gradle:*) Bash(npx:*) Bash(cd:*) Bash(cp:*) Bash(git:*) Bash(printenv:*)
---

## Step 1 — Read test state and build work queue

Read `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`.

If the file does not exist, tell the user:
> "No Qualflare state file found. Please run `/qf-init` first to set up the integration, then re-run `/qf-run`."

Stop here — do not proceed without the state file.

**Parse `## Packages` table**: build a map of `path → identifier` from the `Path` and `Identifier` columns. If the `## Packages` table is absent, stop and tell the user to run `/qf-init` to refresh the state file.

**Parse `## Frameworks in use` table**: read every row's `Package`, `Slug`, and `Top-level paths` columns. If the table has no `Package` column (legacy format without monorepo support), treat all rows as belonging to `(root)`.

**Build the per-package work queue** — one item per (Package, Slug) row:
```
[{ package, identifier, slug, cwd }]
```
Where `cwd` = `$CLAUDE_PROJECT_DIR` for `(root)`, or `$CLAUDE_PROJECT_DIR/<package-path>` for named packages.

**Filter via `$ARGUMENTS`** (tie-breaker: any value containing `/` is a package path; anything else is a slug):
- `$ARGUMENTS` contains `/` → treat as a package path prefix. Keep only queue items whose `package` field starts with that prefix.
- `$ARGUMENTS` is a single word without `/` → treat as a framework slug. Keep only items whose `slug` matches.
- `$ARGUMENTS` contains both a path and a slug (e.g., `packages/web jest`) → apply both filters.
- `$ARGUMENTS` is empty → no filtering; run the full queue.

If the filtered queue is empty, tell the user:
> "No matching packages or frameworks found for `<$ARGUMENTS>`. Check `/qf-state` for available packages and slugs."

Then stop.

---

## Step 2 — Run tests per package/framework

Before running any framework, create the results subdirectory for each package in the queue:

```bash
mkdir -p $CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>
```

Where `<package-dir>` is:
- `root` when the package path is `(root)`
- The package path verbatim for named packages (e.g., `packages/web`), creating nested subdirs like `.qualflare/results/packages/web/`

For each item in the work queue, `cd` to the item's `cwd` and run the command from the table below. Always write output to `$CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/<slug>.<ext>` — use the absolute project-root path so the output file location is unambiguous regardless of `cwd`.

| Slug | Command (run from `cwd`) | Output file |
|------|--------------------------|-------------|
| jest | `npx jest --json --outputFile=$CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/jest.json` | `.qualflare/results/<package-dir>/jest.json` |
| vitest | `npx vitest run --reporter=json --outputFile=$CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/jest.json` (upload as slug `jest`) | `.qualflare/results/<package-dir>/jest.json` |
| mocha | `npx mocha --reporter xunit > $CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/mocha.xml` | `.qualflare/results/<package-dir>/mocha.xml` |
| pytest | `pytest --junit-xml=$CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/pytest.xml` | `.qualflare/results/<package-dir>/pytest.xml` |
| golang | `go test ./... -json > $CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/golang.json` | `.qualflare/results/<package-dir>/golang.json` |
| playwright | `npx playwright test --reporter=junit --output-file=$CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/playwright.xml` | `.qualflare/results/<package-dir>/playwright.xml` |
| cypress | `npx cypress run --reporter junit --reporter-options mochaFile=$CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/cypress.xml` | `.qualflare/results/<package-dir>/cypress.xml` |
| rspec | `bundle exec rspec --format RspecJunitFormatter --out $CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/rspec.xml` | `.qualflare/results/<package-dir>/rspec.xml` |
| phpunit | `./vendor/bin/phpunit --log-junit $CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/phpunit.xml` | `.qualflare/results/<package-dir>/phpunit.xml` |
| junit | See note below | See note below |
| cucumber | See note below | varies |
| k6 | See note below | n/a |

**junit note:** Check for `pom.xml` (Maven) or `build.gradle`/`build.gradle.kts` (Gradle).
- Maven: `mvn test` → `cp target/surefire-reports/*.xml $CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/junit.xml`
- Gradle: `gradle test` → `cp build/test-results/test/*.xml $CLAUDE_PROJECT_DIR/.qualflare/results/<package-dir>/junit.xml`

Upload with `--format junit`.

**cucumber note:** Run varies by language. For JavaScript use `cucumber-js`; for Java use the cucumber JUnit runner. Capture JUnit XML output. Inspect the project scripts to determine the exact command.

**k6 note:** k6 does not natively produce JUnit XML. Run `k6 run script.js` to execute the load test. Upload support for k6 is limited — direct the user to the Qualflare docs.

**Unknown frameworks:** For any slug not listed above (selenium, testcafe, karate, newman, zap, trivy, snyk, sonarqube), tell the user:
> "I detected `<slug>` in your project but don't have a built-in run command for this framework. Please run the tool manually to generate a results file, then run `/qf-run <results-file>` to upload."

**Continue-on-error:** If a test run command exits non-zero due to **test failures** (not a missing tool or configuration error), note the failure, record it for the summary, and **continue** to the next item in the queue. Do not abort the entire run for test failures.

---

## Step 3 — Upload results

Before uploading, verify the `qf` CLI is available:

```bash
qf version
```

If the command exits with code 127 (command not found) or is otherwise unavailable, tell the user:

> "`qf` CLI not found. Download and install it from https://qualflare.com/docs/cli, then re-run `/qf-run`."

Stop here — do not attempt uploads without the CLI.

Before uploading, detect git metadata and the runtime environment:

```bash
git rev-parse --abbrev-ref HEAD   # branch name
git rev-parse --short HEAD        # short commit hash
```

If either git command fails (not a git repo, no commits), omit the corresponding flag.

**Environment detection:** Check environment variables to determine where the tests are running:

```bash
printenv GITHUB_ACTIONS   # → "true" if GitHub Actions
printenv CIRCLECI         # → "true" if CircleCI
printenv TRAVIS           # → "true" if Travis CI
printenv CI               # → "true" for most CI systems
```

- If `GITHUB_ACTIONS=true`: environment = `"github-actions"`
- Else if `CIRCLECI=true`: environment = `"circleci"`
- Else if `TRAVIS=true`: environment = `"travis"`
- Else if `CI=true`: environment = `"ci"`
- Else: environment = `"local"`

For each result file produced in Step 2, run `qf <identifier> collect` with `--format`, `--branch`, `--commit`, and `--environment`:

```bash
qf <identifier> collect <results-file> \
  --format <slug> \
  --branch "<branch>" \
  --commit "<commit>" \
  --environment "<environment>"
```

Omit `--branch` or `--commit` if the corresponding git command failed. Always include `--environment`.

The `<identifier>` is the value from the `## Packages` table row whose `Path` matches the current package — read it from the `Identifier` column.

**If `qf <identifier> collect` exits with a non-zero code AND the error output contains any of the words `auth`, `token`, `unauthorized`, or `401`:**

Tell the user:
> "Upload failed — your token for `<identifier>` is missing or invalid. Run: `qf login <identifier> <token>` (get your token from https://qualflare.com/settings/api-keys), then re-run `/qf-run`."

Stop here. Do not retry any remaining uploads.

**If the error output contains `no identifier` or `not configured`** (the CLI's hint when the identifier has not been registered locally):

Tell the user:
> "Upload failed — `<identifier>` is not configured locally. Run: `qf login <identifier> <token>`, then re-run `/qf-run`."

Stop here. Do not retry any remaining uploads.

**For any other non-zero exit code:** Log the failure (package + slug + error message) and **continue** with the remaining items.

After all uploads are attempted, if any non-auth failures occurred, print a grouped failure list:

```
Upload failures:
  packages/api / golang  — <error message>
```

---

## Step 4 — Print summary

After all uploads are attempted, print a results summary.

**Single-package format** (work queue had only one package, i.e., `(root)`):

```
Test run complete:

Framework   Status   Passed   Failed   Skipped
─────────────────────────────────────────────
jest        ✅        47       0        2
playwright  ✅        12       0        0

Uploaded to Qualflare. ✅
```

**Multi-package format** (work queue had more than one package):

```
Test run complete:

packages/web  (@acme/web)
  jest         ✅   47 passed / 0 failed / 2 skipped
  playwright   ✅   12 passed / 0 failed / 0 skipped

packages/api  (acme-api)
  golang       ❌   10 passed / 2 failed / 0 skipped
    • internal/auth: TestToken_Expired
    • internal/auth: TestToken_Malformed

Uploaded to Qualflare ✅  (2 of 3 frameworks passed)
```

Parse result files to populate Passed / Failed / Skipped counts where possible:
- For JSON output (jest, golang): parse the JSON to extract counts.
- For JUnit XML output: count `<testcase>` elements, `<failure>` / `<error>` children, and `skipped` attributes.

If a result file cannot be parsed, show `—` for the counts.

For failed test runs, list the first 3–5 failing test names in the summary if they can be extracted from the result file.

If `qf <identifier> collect` printed a URL or run ID in its stdout or stderr, include it below the table:
```
View run: https://app.qualflare.com/runs/abc123
```

If any frameworks had test failures (❌ status), append:
```
To fix failing tests automatically: /qf-fix
```

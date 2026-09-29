---
name: qf-run
description: >
  Run the project's test suite and upload results to Qualflare. Use when the
  user runs /qf-run, asks to "run tests and report", asks to "run tests
  and upload", or explicitly invokes this skill after writing tests. Also
  uploads an existing report file: /qf-run <report-path> [slug].
argument-hint: "[framework-slug | package/path | report-path [slug]]"
allowed-tools: Read Glob Bash(qf:*) Bash(mkdir:*) Bash(rm -f:*) Bash(rm -rf:*) Bash(npm:*) Bash(pnpm:*) Bash(yarn:*) Bash(go test:*) Bash(python:*) Bash(pytest:*) Bash(jest:*) Bash(vitest:*) Bash(playwright:*) Bash(cypress:*) Bash(bundle:*) Bash(rspec:*) Bash(phpunit:*) Bash(mvn:*) Bash(gradle:*) Bash(npx:*) Bash(PLAYWRIGHT_JSON_OUTPUT_FILE=* npx playwright test *) Bash(cd:*) Bash(cp:*) Bash(git:*)
---

Paths below use `${CLAUDE_PROJECT_DIR}`, which Claude Code replaces with the absolute project root when it loads this skill. The Bash tool does not have a `CLAUDE_PROJECT_DIR` variable, so always run the paths exactly as written here (already expanded), in double quotes.

## Step 1 — Read test state and build work queue

Read `${CLAUDE_PROJECT_DIR}/.qualflare/test-state.md`.

If the file does not exist, tell the user:
> "No Qualflare state file found. Please run `/qf-init` first to set up the integration, then re-run `/qf-run`."

Stop here — do not proceed without the state file.

**Parse `## Packages` table**: build a map of `path → identifier` from the `Path` and `Identifier` columns. If the `## Packages` table is absent, stop and tell the user to run `/qf-init` to refresh the state file.

**Parse `## Frameworks in use` table**: read every row's `Package`, `Slug`, and `Top-level paths` columns. If the table has no `Package` column (legacy format without monorepo support), treat all rows as belonging to `(root)`.

**Build the per-package work queue** — one item per (Package, Slug) row:
```
[{ package, identifier, slug, cwd }]
```
Where `cwd` = `${CLAUDE_PROJECT_DIR}` for `(root)`, or `${CLAUDE_PROJECT_DIR}/<package-path>` for named packages.

**Interpret `$ARGUMENTS`** — check these rules in order and use the first that matches:

1. `$ARGUMENTS` is empty → no filtering; run the full queue.
2. The first token is **exactly** a slug in the `Slug` column of `## Frameworks in use` → slug filter: keep only items whose `slug` matches. Check this **before** any path matching: in a standard Cypress project `cypress` is also the `./cypress` directory, and `/qf-run cypress` means "run Cypress", not "upload that directory".
3. The first token is a package path, or a prefix of one, from `## Packages` → package filter: keep only queue items whose `package` starts with it. If a second token is present, it is a slug: also keep only items whose `slug` matches.
4. The first token is clearly a report → **report-upload mode**. Go to "Report-upload mode" below and skip Step 2. A token is clearly a report when it is (paths relative to `${CLAUDE_PROJECT_DIR}` or absolute; check with Read or Glob):
   - an existing **file**, or
   - a **glob** that matches at least one file, or
   - an existing **directory** *and* a second token that is a slug listed in `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`. For a directory without that second token, ask first: "`<token>` is a directory. Upload the reports inside it to Qualflare? If so, which framework produced them?" — and enter report-upload mode only if the user confirms.
5. Otherwise the first token is a framework slug: keep only items whose `slug` matches.

If the filtered queue is empty, tell the user:
> "No matching packages or frameworks found for `<$ARGUMENTS>`. Check `/qf-state` for available packages and slugs. To upload a report you produced yourself, pass its path: `/qf-run <report-path> <slug>`."

Then stop.

### Report-upload mode

Use this mode to upload a report that `/qf-run` has no runner command for (see "Frameworks without a runner command" in Step 2), or any report the user already has.

1. **Slug.** If a second token is present and it is a slug listed in `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`, use it. Otherwise run `qf validate "<report-path>"` — for a directory or glob, pass the matching files instead, because `qf validate` does not expand them itself. It parses locally, needs no login, and prints `valid (<slug>, N tests)` for each file it recognises and propose the detected slug to the user. Ask the user to confirm or correct the slug before uploading.
2. **Identifier.** If `## Packages` has one row, use its identifier. Otherwise use the row whose `Path` is the longest prefix of the report's path relative to `${CLAUDE_PROJECT_DIR}`. If none matches, list the identifiers from `## Packages` and ask the user which project the report belongs to.
3. **Upload.** Build a one-item upload list `{ package, identifier, slug, resultPath: <report-path> }` and continue at Step 3. For a directory of JSON reports pass the directory itself (the CLI uploads every `*.json` directly inside it). For a directory of XML reports pass a quoted glob such as `"<dir>/*.xml"` (the CLI expands globs itself). In Step 4, print only the upload outcome for this report — there are no pass/fail counts from a run.

---

## Step 2 — Run tests per package/framework

In this step, `<R>` stands for `${CLAUDE_PROJECT_DIR}/.qualflare/results/<package-dir>`, where `<package-dir>` is:
- `root` when the package path is `(root)`
- The package path verbatim for named packages (e.g., `packages/web`), creating nested subdirs like `.qualflare/results/packages/web/`

Before running any framework, create the results directory for each package in the queue:

```bash
mkdir -p "<R>"
```

For each item in the work queue, `cd` to the item's `cwd` and run the command from the table below. Always write output under `<R>` — the absolute project-root path — so the output location is unambiguous regardless of `cwd`.

Every command writes the format the CLI parser for that upload slug reads (`qf validate --format <slug>` accepts it). Do not substitute a different reporter: the CLI does not sniff content when `--format` is given, so a JUnit XML file uploaded as `--format mocha` fails to parse.

| Detected slug | Test runner command (run from `cwd`) | Upload slug | Result path |
|---------------|--------------------------------------|-------------|-------------|
| `jest` | `rm -f "<R>/jest.json"`, then, if `package.json` in `cwd` has a `vitest` dependency: `npx vitest run --reporter=json --outputFile="<R>/jest.json"`; otherwise: `npx jest --json --outputFile="<R>/jest.json"` | `jest` | `<R>/jest.json` |
| `mocha` | `rm -f "<R>/mocha.json"`, then `npx mocha --reporter json --reporter-option output="<R>/mocha.json"` | `mocha` | `<R>/mocha.json` |
| `python` | `rm -f "<R>/python.xml"`, then `pytest --junit-xml="<R>/python.xml"` | `python` | `<R>/python.xml` |
| `golang` | `rm -f "<R>/golang.json"`, then `go test ./... -json > "<R>/golang.json"` | `golang` | `<R>/golang.json` |
| `playwright` | `rm -f "<R>/playwright.json"`, then `PLAYWRIGHT_JSON_OUTPUT_FILE="<R>/playwright.json" npx playwright test --reporter=json` | `playwright` | `<R>/playwright.json` |
| `cypress` | See note below | `cypress` | `<R>/cypress/` (one JSON per spec) |
| `rspec` | `rm -f "<R>/rspec.json"`, then `bundle exec rspec --format json --out "<R>/rspec.json"` | `rspec` | `<R>/rspec.json` |
| `phpunit` | `rm -f "<R>/phpunit.xml"`, then `./vendor/bin/phpunit --log-junit "<R>/phpunit.xml"` | `phpunit` | `<R>/phpunit.xml` |
| `junit` | See note below | `junit` | `<R>/junit/` (one XML per test class) |
| `cucumber` | See note below | `cucumber` | `<R>/cucumber.json` |

**Remove the previous result before every run.** Each row (and each note below) first deletes that framework's result file (`rm -f`) or result directory (`rm -rf`, then `mkdir -p`). A runner that crashes or hits a configuration error before writing anything would otherwise leave the last run's report in place, and it would upload as this commit's results.

**cypress note:** the CLI's Cypress parser reads Mochawesome JSON. Check whether `mochawesome` is in the `cwd` package's `devDependencies`/`dependencies`. If it is not, tell the user: "Cypress results upload as Mochawesome JSON. Add it with `npm install --save-dev mochawesome` (or your package manager's equivalent), then re-run `/qf-run`." and skip this item. If it is:
```bash
rm -rf "<R>/cypress" && mkdir -p "<R>/cypress"
npx cypress run --reporter mochawesome --reporter-options "reportDir=<R>/cypress,reportFilename=[name],overwrite=false,html=false,json=true,quiet=true"
```
Cypress runs one reporter per spec, so this writes one JSON file per spec into `<R>/cypress/`. `[name]` is the spec's file name only, so two specs with the same name in different folders (`admin/login.cy.ts`, `shop/login.cy.ts`) would both write `login.json`; `overwrite=false` makes mochawesome add a counter (`login_001.json`) instead of replacing the first report. Keep it.

**junit note:** Check for `pom.xml` (Maven) or `build.gradle`/`build.gradle.kts` (Gradle). Surefire and Gradle write one `TEST-*.xml` file per test class, so copy them into a directory — never onto a single file path.

First clear this run's output, both ours and the build tool's, so an earlier run's reports cannot be collected:
```bash
rm -rf "<R>/junit" && mkdir -p "<R>/junit"
```
- Maven: `mvn clean test` (`clean` deletes `target/`, so no stale `surefire-reports` survive), then `cp target/surefire-reports/TEST-*.xml "<R>/junit/"`
- Gradle: `gradle cleanTest test` (or `./gradlew cleanTest test` when the wrapper exists; `cleanTest` deletes the test results and forces the tests to run even when Gradle considers them up to date), then `cp build/test-results/test/TEST-*.xml "<R>/junit/"`

If the copy matches no files, the run produced no reports — record it as a run failure for the summary.

**cucumber note:** the CLI's Cucumber parser reads Cucumber JSON. First `rm -f "<R>/cucumber.json"`. Then inspect the project to pick the runner:
- JavaScript (`@cucumber/cucumber` in deps): `npx cucumber-js --format json:"<R>/cucumber.json"`
- Ruby (`cucumber` in `Gemfile`): `bundle exec cucumber --format json --out "<R>/cucumber.json"`
- Java (Maven with `cucumber-java`): `mvn clean test -Dcucumber.plugin="json:<R>/cucumber.json"`

**Frameworks without a runner command:** for any other slug (`selenium`, `testcafe`, `karate`, `newman`, `k6`, `testng`, `maestro`, `xctest`, `espresso`, `zap`, `trivy`, `snyk`, `sonarqube`), do not guess a command. Tell the user which report format the CLI reads for that slug, from this table:

| Slug | Report format the CLI parses |
|------|------------------------------|
| `selenium` | Selenium/WebDriver JSON report |
| `testcafe` | TestCafe JSON reporter output |
| `karate` | Karate JSON report |
| `newman` | Newman JSON reporter output |
| `k6` | k6 JSON end-of-test summary |
| `testng`, `maestro`, `espresso` | JUnit XML |
| `xctest` | JUnit XML (e.g. `xcodebuild test … \| xcbeautify --report junit`, or `xcpretty -r junit`). **Not** an `.xcresult` bundle: `qf collect` treats a directory as a folder of `*.json` reports and rejects the bundle. Convert it to JUnit XML first. |
| `zap` | OWASP ZAP JSON report |
| `trivy` | Trivy JSON output |
| `snyk` | Snyk JSON test output |
| `sonarqube` | SonarQube issues export (JSON) |

> "I detected `<slug>` in your project but don't run it automatically. Produce a `<format>` report with the tool, then upload it with `/qf-run <report-path> <slug>`."

**Continue-on-error:** If a test run command exits non-zero due to **test failures** (not a missing tool or configuration error), note the failure, record it for the summary, and **continue** to the next item in the queue. Do not abort the entire run for test failures.

**A run that wrote nothing new is a run failure, not an upload.** Because the previous result was removed first, the result path after the command reflects this run only. If it does not exist, is empty (a crashed `go test … > file` still creates the file), or — for a directory — contains no report files, the runner exited with a configuration or crash error before writing results: record a run failure for that item with the runner's error output, and do not upload it.

---

## Step 3 — Upload results

Before uploading, verify the `qf` CLI is available:

```bash
qf version
```

If the command exits with code 127 (command not found) or is otherwise unavailable, tell the user:

> "`qf` CLI not found. Download and install it from https://qualflare.com/docs/cli, then re-run `/qf-run`."

Stop here — do not attempt uploads without the CLI.

**Auth pre-flight:** Before entering the upload loop, collect the unique set of identifiers needed by this run — the `Identifier` values from the `## Packages` table rows that have items in the work queue. Then run:

```bash
qf projects
```

This prints one saved identifier per line. For each required identifier that is **not** present in the output, tell the user:

> "Credentials not found for project `<identifier>`. In your own terminal (not in this chat), run:
> ```
> qf login <identifier>
> ```
> It asks for the token at a hidden prompt. Get a token from https://app.qualflare.com/project/<identifier>/settings/access-tokens, then re-run `/qf-run`. Do not paste the token here."

Stop here if any required identifier is missing.

Before uploading, detect git metadata:

```bash
git rev-parse --abbrev-ref HEAD   # branch name
git rev-parse --short HEAD        # short commit hash
```

If either git command fails (not a git repo, no commits), omit the corresponding flag.

For each result path produced in Step 2 (or the report from report-upload mode), upload via `qf <identifier> collect` using the **upload slug** from the Step 2 table:

```bash
qf <identifier> collect <result-path> \
  --format <slug> \
  --branch "<branch>" \
  --commit "<commit>"
```

- `<result-path>` is the file for file results. For `cypress` pass the directory `"<R>/cypress"` (the CLI uploads every `*.json` inside it as one launch). For `junit` pass the quoted glob `"<R>/junit/*.xml"` (the CLI expands the glob itself and uploads all files as one launch).
- Omit `--branch` or `--commit` if the corresponding git command failed.
- **Do not pass `--environment`.** The CLI then uses `$QF_ENVIRONMENT` if the user has set it, and otherwise `development`, which every Qualflare project is created with. The server rejects an environment name the project does not have, so never invent one (such as `local` or `ci`).

The `<identifier>` is the value from the `## Packages` table row whose `Path` matches the current package — read it from the `Identifier` column.

**Classify each upload by the exit code the Bash tool reports** — never by searching stderr for words such as `auth` or `token` (paths and messages contain them):

| Exit code | Meaning (qf CLI) | What to do |
|-----------|------------------|------------|
| `0` | Uploaded | Record the item as uploaded. |
| `3` | The server rejected the token (401) | Tell the user: "The saved token for `<identifier>` was rejected. In your own terminal, run `qf login <identifier>` and confirm the overwrite, then re-run `/qf-run`." Skip the remaining uploads for this identifier; continue with other identifiers. |
| `4` | Access denied or plan limit (402/403) | Record the failure with the stderr verbatim. Continue. |
| `5` | Not found (404) | Record the failure with the stderr verbatim. If the stderr says the environment was not found, add: "Your Qualflare project has no environment named `<$QF_ENVIRONMENT, or development if unset>`. Create it in the project settings, or set `QF_ENVIRONMENT` to an environment the project has." Continue. |
| `7` | Transient (429 or 5xx) | Retry the same upload once. If it fails again, record the failure with the stderr verbatim. Continue. |
| `1` | Any other error (bad file, parse error, unknown identifier, bad flag) | If the stderr starts with `Error: no identifier "<identifier>" configured`, treat it like a missing identifier in the auth pre-flight and stop. Otherwise record the failure with the stderr verbatim and continue. |

**Diagnosis discipline (strict):**

When `qf collect` fails, your job is to **report the CLI's stderr verbatim** — not to diagnose what's wrong with the user's CLI install. In particular, you MUST NOT:

- Read `~/.config/qualflare/config.toml`, `~/Library/Application Support/qualflare/config.toml`, or any other CLI config file for diagnosis. The auth store contains only `{schema_version, identifiers.<id>.token}` — there are no other fields to inspect or suggest.
- Suggest `--api-endpoint`, `QF_API_ENDPOINT`, `--api-key`, `QF_API_KEY`, or any flag / env var not explicitly listed in this skill. The API endpoint is hardcoded in the CLI binary (`https://api.qualflare.com`) and is not user-configurable. `QF_API_KEY` is intentionally ignored by the CLI. The one env var you may mention is `QF_ENVIRONMENT`, and only for the exit-code-5 environment case above.
- Recommend re-running `/qf-init` "to capture missing configuration" — `/qf-init` writes nothing the CLI reads at runtime beyond the token registered via `qf login`.

Outside the cases in the exit-code table, record the raw stderr in the failure list and move on. Do not theorize.

After all uploads are attempted, if any failures occurred, print a grouped failure list:

```
Upload failures:
  packages/api / golang  — exit 5 — <stderr from qf collect>
```

---

## Step 4 — Print summary

After all uploads are attempted, print a results summary. The last line reports what was actually uploaded: print `Uploaded to Qualflare ✅` only when **every** upload exited 0. Otherwise print `Uploaded <N> of <M> result sets to Qualflare ⚠️ — see "Upload failures" above.` (or `Nothing was uploaded to Qualflare ❌` when N is 0).

**Single-package format** (work queue had only one package, i.e., `(root)`):

```
Test run complete:

Framework   Status   Passed   Failed   Skipped   Upload
──────────────────────────────────────────────────────
jest        ✅        47       0        2         ✅
playwright  ✅        12       0        0         ✅

Uploaded to Qualflare ✅
```

**Multi-package format** (work queue had more than one package):

```
Test run complete:

packages/web  (@acme/web)
  jest         ✅   47 passed / 0 failed / 2 skipped   upload ✅
  playwright   ✅   12 passed / 0 failed / 0 skipped   upload ✅

packages/api  (acme-api)
  golang       ❌   10 passed / 2 failed / 0 skipped   upload ❌
    • internal/auth: TestToken_Expired
    • internal/auth: TestToken_Malformed

Uploaded 2 of 3 result sets to Qualflare ⚠️ — see "Upload failures" above.
```

Parse result files to populate Passed / Failed / Skipped counts where possible:
- jest / vitest: the top-level `numPassedTests`, `numFailedTests`, `numPendingTests`.
- golang: count `"Action":"pass"`, `"fail"`, `"skip"` lines that have a `Test` field.
- mocha: `stats.passes`, `stats.failures`, `stats.pending`.
- playwright: `stats.expected` (passed), `stats.unexpected` (failed), `stats.skipped`; `stats.flaky` counts as passed.
- cypress: sum `stats.passes`, `stats.failures`, `stats.pending` over every JSON file in the directory.
- rspec: `summary.example_count`, `summary.failure_count`, `summary.pending_count` (passed = example count − failures − pending).
- cucumber: count scenarios (`elements` with `type` `scenario`); a scenario failed if any step `result.status` is `failed`, skipped if all steps are `skipped`/`pending`/`undefined`.
- JUnit XML (python, phpunit, junit): count `<testcase>` elements, `<failure>` / `<error>` children, and `<skipped>` children, summed over every file.

If a result file cannot be parsed, show `—` for the counts.

For failed test runs, list the first 3–5 failing test names in the summary if they can be extracted from the result file.

If any frameworks had test failures (❌ status), append:
```
To fix failing tests automatically: /qf-fix
```

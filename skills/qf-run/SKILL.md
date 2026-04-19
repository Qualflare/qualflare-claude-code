---
name: qf-run
description: >
  Run the project's test suite and upload results to Qualflare. Use when the
  user runs /qf-run, asks to "run tests and report", asks to "run tests
  and upload", or explicitly invokes this skill after writing tests.
allowed-tools: Read Bash(qf:*) Bash(mkdir:*) Bash(npm:*) Bash(pnpm:*) Bash(yarn:*) Bash(go test:*) Bash(python:*) Bash(pytest:*) Bash(jest:*) Bash(vitest:*) Bash(playwright:*) Bash(cypress:*) Bash(bundle:*) Bash(rspec:*) Bash(phpunit:*) Bash(mvn:*) Bash(gradle:*) Bash(npx:*)
---

## Step 1 — Read test state

Read `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`.

If the file does not exist, tell the user:
> "No Qualflare state file found. Please run `/qf-init` first to set up the integration, then re-run `/qf-run`."

Stop here — do not proceed without the state file.

From the state file, extract:
- The list of framework slugs in use
- The project name

If `$ARGUMENTS` is provided (e.g. a framework slug such as `jest`, or a file glob such as `src/**/*.test.ts`), filter execution to only that scope. Skip frameworks that do not match the argument.

---

## Step 2 — Run tests per framework

Before running any framework, create the results directory:

```bash
mkdir -p $CLAUDE_PROJECT_DIR/.qualflare/results
```

For each detected framework slug, run the appropriate command below to produce a machine-readable results file. Run the commands from `$CLAUDE_PROJECT_DIR`.

| Slug | Command | Output file |
|------|---------|-------------|
| jest | `npx jest --json --outputFile=.qualflare/results/jest.json` | `.qualflare/results/jest.json` |
| vitest | Not a stored slug — vitest projects use the `jest` slug. Run: `npx vitest run --reporter=json --outputFile=.qualflare/results/jest.json` and upload under slug `jest`. | `.qualflare/results/jest.json` |
| mocha | `npx mocha --reporter xunit > .qualflare/results/mocha.xml` | `.qualflare/results/mocha.xml` |
| pytest | `pytest --junit-xml=.qualflare/results/pytest.xml`  (or: `python -m pytest --junit-xml=.qualflare/results/pytest.xml` in virtualenv) | `.qualflare/results/pytest.xml` |
| golang | `go test ./... -json > .qualflare/results/golang.json` | `.qualflare/results/golang.json` |
| playwright | `npx playwright test --reporter=junit --output-file=.qualflare/results/playwright.xml` | `.qualflare/results/playwright.xml` |
| cypress | `npx cypress run --reporter junit --reporter-options mochaFile=.qualflare/results/cypress.xml` | `.qualflare/results/cypress.xml` |
| rspec | `bundle exec rspec --format RspecJunitFormatter --out .qualflare/results/rspec.xml` | `.qualflare/results/rspec.xml` |
| phpunit | `./vendor/bin/phpunit --log-junit .qualflare/results/phpunit.xml` | `.qualflare/results/phpunit.xml` |
| junit | See note below | See note below |
| cucumber | See note below | varies |
| k6 | See note below | n/a |

**junit note:** JUnit tests are run by Maven or Gradle. Check for `pom.xml` to determine Maven, or `build.gradle` / `build.gradle.kts` for Gradle.
- Maven: `mvn test` → results in `target/surefire-reports/*.xml`. Copy one report: `cp target/surefire-reports/*.xml .qualflare/results/junit.xml`
- Gradle: `gradle test` → results in `build/test-results/**/*.xml`. Copy one report: `cp build/test-results/test/*.xml .qualflare/results/junit.xml`

Upload with `--format junit`.

**cucumber note:** Run varies by language. For JavaScript use `cucumber-js`; for Java use the cucumber JUnit runner. Capture JUnit XML output. The exact command depends on how the project has configured cucumber — inspect the project scripts first.

**k6 note:** k6 does not natively produce JUnit XML. Run `k6 run script.js` to execute the load test. Note that upload support for k6 is limited — direct the user to the Qualflare docs for guidance on how to integrate k6 results.

**Unknown frameworks:** For any slug not listed above (selenium, testcafe, karate, newman, zap, trivy, snyk, sonarqube), tell the user:
> "I detected `<slug>` in your project but don't have a built-in run command for this framework. Please run the tool manually to generate a results file, then run `/qf-run <results-file>` to upload."

---

## Step 3 — Upload results

Before uploading, verify the `qf` CLI is available:

```bash
qf version
```

If the command exits with code 127 (command not found) or is otherwise unavailable, tell the user:

> "`qf` CLI not found. Download and install it from https://qualflare.com/docs/cli, then re-run `/qf-run`."

Stop here — do not attempt uploads without the CLI.

For each result file produced in Step 2, run `qf upload` with the explicit `--format` flag matching the framework slug used to produce the file:

```bash
qf upload <results-file> --format <slug>
```

For example: `qf upload .qualflare/results/jest.json --format jest` or `qf upload .qualflare/results/playwright.xml --format playwright`.

**If `qf upload` exits with a non-zero code AND the error output contains any of the words `auth`, `token`, `unauthorized`, `401`, or `login`:**

Tell the user:
> "Looks like `qf` isn't authenticated. Run `qf login` to connect your workspace, then re-run `/qf-run`."

Stop here. Do not retry the upload.

**For any other non-zero exit code:** Show the full error output to the user and suggest they check the [Qualflare docs](https://qualflare.com/docs) for troubleshooting.

---

## Step 4 — Print summary

After all uploads are complete, print a results summary in this format:

```
Test run complete:

Framework   Status   Passed   Failed   Skipped
─────────────────────────────────────────────
jest        ✅        47       0        2
playwright  ✅        12       0        0

Uploaded to Qualflare. ✅
```

Parse the result files to populate Passed / Failed / Skipped counts where possible:
- For JSON output (jest, golang): parse the JSON to extract counts.
- For JUnit XML output: count `<testcase>` elements, failures, errors, and skipped elements.

If a result file cannot be parsed, show `—` for the counts.

If `qf upload` printed a URL or run ID in its stdout or stderr output, include it below the table, e.g.:
```
View run: https://app.qualflare.com/runs/abc123
```

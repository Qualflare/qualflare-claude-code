---
name: qualflare-test-run
description: >
  Run the project's test suite and upload results to Qualflare. Use when the
  user runs /qualflare-run, asks to "run tests and report", asks to "run tests
  and upload", or explicitly invokes this skill after writing tests.
allowed-tools: Read Bash(qf:*) Bash(npm:*) Bash(pnpm:*) Bash(yarn:*) Bash(go test:*) Bash(pytest:*) Bash(jest:*) Bash(vitest:*) Bash(playwright:*) Bash(cypress:*) Bash(rspec:*) Bash(phpunit:*)
---

## Step 1 — Read test state

Read `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`.

If the file does not exist, tell the user:
> "No Qualflare state file found. Please run `/qualflare-init` first to set up the integration, then re-run `/qualflare-run`."

Stop here — do not proceed without the state file.

From the state file, extract:
- The list of framework slugs in use
- The project name

If `$ARGUMENTS` is provided (e.g. a framework slug such as `jest`, or a file glob such as `src/**/*.test.ts`), filter execution to only that scope. Skip frameworks that do not match the argument.

---

## Step 2 — Run tests per framework

For each detected framework slug, run the appropriate command below to produce a machine-readable results file. Run the commands from `$CLAUDE_PROJECT_DIR`.

| Slug | Command | Output file |
|------|---------|-------------|
| jest | `npx jest --reporters=default --outputFile=qualflare-results.json --json` | `qualflare-results.json` |
| vitest | `npx vitest run --reporter=junit --outputFile=qualflare-results.xml` | `qualflare-results.xml` |
| mocha | `npx mocha --reporter xunit > qualflare-results.xml` | `qualflare-results.xml` |
| pytest | `python -m pytest --junit-xml=qualflare-results.xml` | `qualflare-results.xml` |
| golang | `go test ./... -json > qualflare-results.json` | `qualflare-results.json` |
| playwright | `npx playwright test --reporter=junit --output-file=qualflare-results.xml` | `qualflare-results.xml` |
| cypress | `npx cypress run --reporter junit --reporter-options mochaFile=qualflare-results.xml` | `qualflare-results.xml` |
| rspec | `bundle exec rspec --format RspecJunitFormatter --out qualflare-results.xml` | `qualflare-results.xml` |
| phpunit | `./vendor/bin/phpunit --log-junit qualflare-results.xml` | `qualflare-results.xml` |
| junit | See note below | See note below |
| cucumber | See note below | varies |
| k6 | See note below | n/a |

**junit note:** JUnit tests are run by Maven or Gradle. Check for `pom.xml` to determine Maven, or `build.gradle` / `build.gradle.kts` for Gradle.
- Maven: `mvn test` → results in `target/surefire-reports/*.xml`
- Gradle: `gradle test` → results in `build/test-results/**/*.xml`

**cucumber note:** Run varies by language. For JavaScript use `cucumber-js`; for Java use the cucumber JUnit runner. Capture JUnit XML output. The exact command depends on how the project has configured cucumber — inspect the project scripts first.

**k6 note:** k6 does not natively produce JUnit XML. Run `k6 run script.js` to execute the load test. Note that upload support for k6 is limited — direct the user to the Qualflare docs for guidance on how to integrate k6 results.

**Unknown frameworks:** For any slug not listed above (selenium, testcafe, karate, newman, zap, trivy, snyk, sonarqube), tell the user:
> "I detected `<slug>` in your project but don't have a built-in run command for this framework. Please run the tool manually to generate a results file, then run `/qualflare-run <results-file>` to upload."

---

## Step 3 — Upload results

For each result file produced in Step 2, run:

```bash
qf upload <results-file>
```

**If `qf upload` exits with a non-zero code AND the error output contains any of the words `auth`, `token`, `unauthorized`, `401`, or `login`:**

Tell the user:
> "Looks like `qf` isn't authenticated. Run `qf login` to connect your workspace, then re-run `/qualflare-run`."

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

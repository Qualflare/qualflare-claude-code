# Qualflare Framework Slugs

> **IMPORTANT**: This file mirrors the canonical framework slugs defined in  
> `qualflare-cli/internal/core/domain/models.go` (`AllFrameworks()`), which is also  
> what `qf list-formats` prints. `scripts/check-slugs.sh` and plugin CI fail when the  
> first column of either table below differs from the CLI's set.

These are the **only valid slugs** accepted by `qf <identifier> collect --format <slug>`.

---

## Slug Reference Table

| Slug | Category | Common indicators | Notes |
|------|----------|-------------------|-------|
| `junit` | Generic | `pom.xml`, `build.gradle`, `@Test` annotations, JUnit XML reports | Catch-all for JVM runners that produce JUnit XML (Surefire, Failsafe). Prefer `testng` when project uses TestNG directly. |
| `ctrf` | Generic | A CTRF reporter in deps (`jest-ctrf-json-reporter`, `playwright-ctrf-json-reporter`, `cypress-ctrf-json-reporter`, `mocha-ctrf-json-reporter`, `wdio-ctrf-json-reporter`, `pytest-json-ctrf`, …), a `ctrf/` output directory, `ctrf-report.json` | Common Test Report Format JSON ([ctrf.io](https://ctrf.io)). Only when a tool has no dedicated slug (WebdriverIO, Jasmine, Nightwatch, CodeceptJS, .NET MSTest/NUnit/xUnit) or the project already emits CTRF. Report files, not test sources. |
| `qualflare-json` | Generic | A Qualflare reporter in deps (`@qualflare/playwright`, `@qualflare/cypress`, `@qualflare/cucumberjs`, `@qualflare/vitest`, `@qualflare/jest`; `@qualflare/webdriverio` and `@qualflare/appium` are detected as their own slugs below) configured to write files (`outputDir` / `outputFile`) | The Collect JSON written by Qualflare's own reporters, used to merge sharded CI runs. Report files, not test sources; the location is whatever the reporter's `outputDir` says. |
| `python` | Unit | `pytest.ini`, `pyproject.toml` (`[tool.pytest...]`), `setup.cfg` (`[tool:pytest]`), `conftest.py`, `requirements*.txt` containing `pytest` | The slug for pytest results |
| `golang` | Unit | `*_test.go` files, `go.mod` present | The slug for go test results (`go test -json`) |
| `jest` | Unit | `jest.config.*`, `"jest"` key in `package.json`, `@jest/` deps | /qf-init also records Vitest packages under `jest` (see `vitest`) |
| `vitest` | Unit | `vitest.config.*`, `vitest` in deps/devDeps, a `test:` block in `vite.config.*` | **Detect as `jest` — do not record `vitest` in test-state.md.** Accepted by the CLI; the same parser as `jest` reads it, and the launch is labelled `jest` either way. /qf-init records Vitest packages under the `jest` slug, whose /qf-run row already runs Vitest when it is a dependency; use `--format vitest` only for a manual `qf <identifier> collect`. |
| `mocha` | Unit | `mocha` in `package.json` deps/devDeps, `.mocharc.*`, `test/` dir with JS files | |
| `rspec` | Unit | `Gemfile` containing `rspec`, `.rspec`, `spec/` directory | |
| `phpunit` | Unit | `phpunit.xml` / `phpunit.xml.dist`, `composer.json` containing `phpunit/phpunit`, `tests/` dir with `*Test.php` | |
| `testng` | Unit | `testng.xml`, `pom.xml` containing `testng`, `build.gradle` containing `testng`, `@Test` from `org.testng` | Produces its own XML format; also can emit JUnit XML |
| `cucumber` | BDD | `*.feature` files, `cucumber` in deps (`cucumber-js`, `@cucumber/cucumber`) | |
| `karate` | BDD | `*.feature` files in `src/test/`, `karate-config.js`, `karate` in `pom.xml` or `build.gradle` | |
| `playwright` | E2E | `playwright.config.*`, `@playwright/test` in deps | |
| `cypress` | E2E | `cypress.config.*`, `cypress/` directory, `cypress` in deps | |
| `selenium` | E2E | `selenium-webdriver` / `selenium` in deps, `SeleniumBase`, `webdriver` imports | No standard file layout; varies by language |
| `testcafe` | E2E | `.testcaferc.*`, `testcafe` in deps, `*.testcafe.{js,ts}` files | |
| `maestro` | E2E | `.maestro/` directory, `*.yaml`/`*.yml` files with `appId:` key inside `.maestro/` | Mobile UI testing (iOS/Android); test files are YAML flows |
| `xctest` | E2E | `*UITests/`, `*Tests/` directories under an Xcode project, `XCTestCase` in `.swift`/`.m` files | iOS/macOS UI and unit testing via Xcode |
| `espresso` | E2E | `androidTest/` directory, `@RunWith(AndroidJUnit4.class)` in `.java`/`.kt`, `espresso` in `build.gradle` deps | Android UI testing |
| `detox` | E2E | `.detoxrc.{js,json}`, `detox.config.*`, a `"detox"` key in `package.json`, `detox` in deps/devDeps | React Native E2E. Detox drives Jest, so its report is a Jest report; `--format detox` tells the CLI to look for Detox artifacts. Prefer `detox` over `jest` for the Detox suite itself (usually `e2e/`). |
| `webdriverio` | E2E | `wdio.conf.{js,ts,mjs,cjs}`, `@wdio/cli` in deps/devDeps | WebdriverIO, web or mobile. Uploads come from the native reporter `@qualflare/webdriverio` (the reporter in `wdio.conf`; from 0.2.0 no service is needed). If the capabilities in `wdio.conf` name `platformName: 'iOS'`/`'Android'` or `appium:*` keys, record `appium` instead |
| `appium` | E2E | a `wdio.conf.*` whose capabilities name `platformName` iOS/Android or `appium:automationName`, `appium` or `@wdio/appium-service` in deps/devDeps | Appium through WebdriverIO, via the native reporter `@qualflare/appium`. Appium driven from Java or Python is recorded under that runner's slug (`testng`, `junit`, `python`), not `appium` |
| `newman` | API | `*.postman_collection.json`, `newman` in deps or scripts | Newman is the Postman CLI runner |
| `k6` | API | `*.k6.js`, `k6/` directory, `import { ... } from 'k6'` in JS files | |
| `zap` | Security | `zap-report.{xml,json,html}`, `zap.yaml`, `.zap/` directory | OWASP ZAP (Zed Attack Proxy) |
| `trivy` | Security | `trivy-results.{json,sarif}`, `trivy.yaml`, `.trivyignore` | |
| `snyk` | Security | `.snyk`, `snyk-results.json`, `snyk` in scripts | |
| `sonarqube` | Security | `sonar-project.properties`, `sonar-report.json`, `sonarqube` or `sonar-scanner` in scripts | |

---

## Test-File Globs Per Slug

Use these globs when scanning a project to confirm framework presence or locate test files.

Every cell in the second column is either a comma-separated list of backticked globs, passed to the Glob tool as-is, or exactly `*(skip counting)*`. **`*(skip counting)*` means the slug has no test-file glob** (`qualflare-json` reports live wherever the reporter's `outputDir` says; Selenium has no standard layout): do not Glob for it — /qf-init records its File count as `—`, and /qf-update, /qf-doctor and /qf-state leave that count alone. `scripts/slugs.mjs` fails on any other cell shape.

| Slug | Glob patterns |
|------|---------------|
| `junit` | `**/pom.xml`, `**/build.gradle` |
| `ctrf` | `**/ctrf/**/*.json`, `**/ctrf-report.json` |
| `qualflare-json` | *(skip counting)* |
| `python` | `tests/**/test_*.py`, `tests/**/*_test.py`, `**/test_*.py` |
| `golang` | `**/*_test.go` |
| `jest` | `**/*.test.{js,jsx,ts,tsx}`, `**/__tests__/**/*.{js,ts}`, `**/*.spec.{js,jsx,ts,tsx}` |
| `vitest` | `**/*.{test,spec}.{js,jsx,ts,tsx,mjs,mts}` |
| `mocha` | `test/**/*.{js,mjs,cjs}`, `**/*.test.{js,mjs}` |
| `rspec` | `spec/**/*_spec.rb` |
| `phpunit` | `tests/**/*Test.php` |
| `testng` | `**/testng.xml`, `**/testng-results.xml`, `src/test/**/*.java`, `src/test/**/*.kt` |
| `cucumber` | `**/*.feature` |
| `karate` | `**/src/test/**/*.feature` |
| `playwright` | `e2e/**/*.spec.{ts,js}`, `playwright/**/*.spec.{ts,js}`, `**/playwright.config.*` |
| `cypress` | `cypress/e2e/**/*.cy.{ts,js}`, `**/cypress.config.*` |
| `selenium` | *(skip counting)* |
| `testcafe` | `tests/**/*.testcafe.{js,ts}` |
| `maestro` | `**/.maestro/**/*.yaml`, `**/.maestro/**/*.yml` |
| `xctest` | `**/*UITests/**/*.swift`, `**/*Tests/**/*.swift`, `**/*UITests/**/*.m`, `**/*Tests/**/*.m` |
| `espresso` | `**/androidTest/**/*.java`, `**/androidTest/**/*.kt` |
| `detox` | `e2e/**/*.test.{js,ts}`, `e2e/**/*.e2e.{js,ts}` |
| `webdriverio` | `test/specs/**/*.{js,ts,mjs}`, `**/*.e2e.{js,ts,mjs}` |
| `appium` | `test/specs/**/*.{js,ts,mjs}`, `**/*.e2e.{js,ts,mjs}` |
| `newman` | `**/*.postman_collection.json` |
| `k6` | `**/*.k6.js`, `**/k6/**/*.js` |
| `zap` | `**/zap-report.{xml,json,html}` |
| `trivy` | `**/trivy-results.{json,sarif}` |
| `snyk` | `**/.snyk`, `**/snyk-results.json` |
| `sonarqube` | `**/sonar-project.properties`, `**/sonar-report.json` |

---

## Extras: Commonly Detected But Not Qualflare Slugs

The following tools are frequently detected in projects but do **not** have their own Qualflare slug. Map or handle them as described:

| Detected tool | Action |
|---------------|--------|
| **cargo-test** | No Qualflare slug yet. Mark as detected but not uploadable; surface a warning to the user |

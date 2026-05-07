# Qualflare Framework Slugs

> **IMPORTANT**: This file mirrors the canonical framework slugs defined in  
> `qualflare-cli/internal/core/domain/models.go`. Keep in sync manually  
> whenever frameworks are added or renamed in the Go source.

These are the **only valid slugs** accepted by `qf <identifier> collect --format <slug>`.

---

## Slug Reference Table

| Slug | Category | Common indicators | Notes |
|------|----------|-------------------|-------|
| `junit` | Unit | `pom.xml`, `build.gradle`, `@Test` annotations, JUnit XML reports | Also used by TestNG and other JVM test runners that produce JUnit XML |
| `python` | Unit | `pytest.ini`, `pyproject.toml` (`[tool.pytest...]`), `setup.cfg` (`[tool:pytest]`), `conftest.py`, `requirements*.txt` containing `pytest` | The slug for pytest results |
| `golang` | Unit | `*_test.go` files, `go.mod` present | The slug for go test results (`go test -json`) |
| `jest` | Unit | `jest.config.*`, `"jest"` key in `package.json`, `@jest/` deps | Also use for vitest (vitest produces jest-compatible output) |
| `mocha` | Unit | `mocha` in `package.json` deps/devDeps, `.mocharc.*`, `test/` dir with JS files | |
| `rspec` | Unit | `Gemfile` containing `rspec`, `.rspec`, `spec/` directory | |
| `phpunit` | Unit | `phpunit.xml` / `phpunit.xml.dist`, `composer.json` containing `phpunit/phpunit`, `tests/` dir with `*Test.php` | |
| `cucumber` | BDD | `*.feature` files, `cucumber` in deps (`cucumber-js`, `@cucumber/cucumber`) | |
| `karate` | BDD | `*.feature` files in `src/test/`, `karate-config.js`, `karate` in `pom.xml` or `build.gradle` | |
| `playwright` | E2E | `playwright.config.*`, `@playwright/test` in deps | |
| `cypress` | E2E | `cypress.config.*`, `cypress/` directory, `cypress` in deps | |
| `selenium` | E2E | `selenium-webdriver` / `selenium` in deps, `SeleniumBase`, `webdriver` imports | No standard file layout; varies by language |
| `testcafe` | E2E | `.testcaferc.*`, `testcafe` in deps, `*.testcafe.{js,ts}` files | |
| `newman` | API | `*.postman_collection.json`, `newman` in deps or scripts | Newman is the Postman CLI runner |
| `k6` | API | `*.k6.js`, `k6/` directory, `import { ... } from 'k6'` in JS files | |
| `zap` | Security | `zap-report.{xml,json,html}`, `zap.yaml`, `.zap/` directory | OWASP ZAP (Zed Attack Proxy) |
| `trivy` | Security | `trivy-results.{json,sarif}`, `trivy.yaml`, `.trivyignore` | |
| `snyk` | Security | `.snyk`, `snyk-results.json`, `snyk` in scripts | |
| `sonarqube` | Security | `sonar-project.properties`, `sonar-report.json`, `sonarqube` or `sonar-scanner` in scripts | |

---

## Test-File Globs Per Slug

Use these globs when scanning a project to confirm framework presence or locate test files.

| Slug | Glob patterns |
|------|---------------|
| `junit` | `**/pom.xml`, `**/build.gradle` |
| `python` | `tests/**/test_*.py`, `tests/**/*_test.py`, `**/test_*.py` |
| `golang` | `**/*_test.go` |
| `jest` | `**/*.test.{js,jsx,ts,tsx}`, `**/__tests__/**/*.{js,ts}`, `**/*.spec.{js,jsx,ts,tsx}` |
| `mocha` | `test/**/*.{js,mjs,cjs}`, `**/*.test.{js,mjs}` |
| `rspec` | `spec/**/*_spec.rb` |
| `phpunit` | `tests/**/*Test.php` |
| `cucumber` | `**/*.feature` |
| `karate` | `**/*.feature` (co-located with `src/test/`) |
| `playwright` | `e2e/**/*.spec.{ts,js}`, `playwright/**/*.spec.{ts,js}`, `**/playwright.config.*` |
| `cypress` | `cypress/e2e/**/*.cy.{ts,js}`, `**/cypress.config.*` |
| `selenium` | *(varies by language)* |
| `testcafe` | `tests/**/*.testcafe.{js,ts}` |
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
| **vitest** | Map to `jest` — vitest uses a jest-compatible reporter and produces identical output format |
| **cargo-test** | No Qualflare slug yet. Mark as detected but not uploadable; surface a warning to the user |

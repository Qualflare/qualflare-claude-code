---
description: "Run a full health check on this project's Qualflare setup. Checks config, CLI, auth, test-state freshness, and framework runner availability. Use when something feels off or after a fresh install."
---

Run the following checks in order and collect a result for each. At the end, print a prioritised fix list.

---

## Check 1 — `.qualflare/config.json`

Read `$CLAUDE_PROJECT_DIR/.qualflare/config.json`.

- ❌ **Missing** — file does not exist. Note: "Run `/qf-init` to create it."
- ❌ **Invalid JSON** — file exists but cannot be parsed. Note: "Delete the file and re-run `/qf-init`."
- ⚠️ **Hook disabled** — `stopHookEnabled` is `false`. Note: "Run `/qf-hook on` to enable the session nudge."
- ✅ **OK** — file is valid and `stopHookEnabled` is `true`.

---

## Check 2 — `.qualflare/test-state.md`

Read `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`.

- ❌ **Missing** — file does not exist. Note: "Run `/qf-init` to generate it."
- ⚠️ **Stale** — the `Generated at:` timestamp is more than 30 days old. Note: "Run `/qf-init` to refresh framework detection."
- ⚠️ **No frameworks** — the `## Frameworks in use` table is empty. Note: "Run `/qf-init` to re-detect your test setup."
- ✅ **OK** — file exists, is recent, and has at least one framework.

---

## Check 3 — `qf` CLI

Run:
```bash
qf version
```

- ❌ **Not found** (exit 127 or command not found) — Note: "Install the CLI from https://qualflare.com/docs/cli."
- ✅ **OK** — show the version number in the report.

---

## Check 4 — Authentication

Run:
```bash
qf status
```

- ❌ **Not authenticated** — exit non-zero with output containing `auth`, `token`, `unauthorized`, `401`, or `login`. Note: "Run `qf login` to connect your workspace."
- ❌ **CLI missing** — skip this check if Check 3 failed.
- ✅ **OK** — connected. Show workspace/project name from output if available.

---

## Check 5 — Framework runners

For each framework slug listed in `test-state.md`, verify the test runner is available:

| Slug | Command to check |
|------|-----------------|
| jest | `npx jest --version` |
| mocha | `npx mocha --version` |
| vitest (→ jest) | `npx vitest --version` |
| playwright | `npx playwright --version` |
| cypress | `npx cypress --version` |
| pytest | `pytest --version` (or `python -m pytest --version`) |
| golang | `go version` |
| rspec | `bundle exec rspec --version` |
| phpunit | `./vendor/bin/phpunit --version` |

For any other slug, skip the runner check and mark as ⚠️ **Unknown runner — verify manually**.

- ❌ **Not found** — runner command exits non-zero or command not found. Note: "Install <runner> to use `/qf-run` for this framework."
- ✅ **OK** — runner is available. Show version.

---

## Output format

Print a single health report:

```
Qualflare Doctor 🩺

✅ config.json         — stopHookEnabled: true
✅ test-state.md       — 2 frameworks, generated 3 days ago
✅ qf CLI              — v1.4.2
✅ Auth                — workspace: acme / project: api-service
✅ jest runner         — v29.7.0
❌ playwright runner   — not found (run: npm install -D @playwright/test)

Issues found (1):
  ❌ playwright runner not found — install with: npm install -D @playwright/test

Everything else looks good. Run /qf-run when ready.
```

If all checks pass:
```
Qualflare Doctor 🩺

✅ config.json         — stopHookEnabled: true
✅ test-state.md       — 2 frameworks, generated 1 day ago
✅ qf CLI              — v1.4.2
✅ Auth                — workspace: acme / project: api-service
✅ jest runner         — v29.7.0
✅ playwright runner   — v1.44.0

All checks passed. Run /qf-run to upload results.
```

If no `test-state.md` exists, skip checks 2 and 5 and lead with:
> "No Qualflare state found. Start with `/qf-init`."

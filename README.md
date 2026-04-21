# qualflare

> AI-powered test coverage, inside Claude Code.

When Claude writes code in your project, it should also write the tests. Qualflare makes that the default: generate coverage for what you changed, run your test suite, fix what breaks, and report it all to your Qualflare dashboard — without switching context.

One-time setup, then just code.

## Quick start

Before you begin, install the [Qualflare CLI](#installing-the-qualflare-cli) and set your `QF_API_KEY` environment variable — then come back here.

Add the plugin to Claude Code:

```
/plugin marketplace add qualflare/qualflare-ai
```

Install it in your current project:

```
/plugin install qualflare@qualflare
```

Run setup once in your project root:

```
/qf-init
```

That's it. `/qf-init` detects your tech stack, reads your package layout, and writes a state file so every future session starts with full context about your tests.

## What you can do

Every command runs from the Claude Code chat — no terminal, no config files.

| Command | When to use it |
|---------|----------------|
| `/qf-init` | Once, to set up a new project — detects frameworks, counts test files, and optionally enables the coverage nudge |
| `/qf-cover [path]` | After writing code — generates tests for the source files you just changed |
| `/qf-run [slug]` | When you're ready to verify — runs your test suite and uploads results to Qualflare |
| `/qf-fix [path]` | When tests are red — analyzes the last run and patches your code until they pass |
| `/qf-doctor` | When something feels wrong — health check covering CLI, API key, config, and file-count drift |
| `/qf-update` | When you've added test files — refreshes counts without re-running full setup |
| `/qf-state` | When you want to see what Qualflare knows — shows frameworks, file counts, and hook status |
| `/qf-hook on\|off` | Any time — toggle the end-of-session coverage nudge on or off |

## The coverage nudge

When enabled during `/qf-init`, a quiet nudge appears at the end of any session where you edited source files without touching the tests:

```
🔍 Qualflare: 3 source file(s) changed without test updates. Run /qf-cover to add coverage.
```

It only fires when something worth covering was changed — trivial edits, config files, and type definitions don't count. Toggle it any time with `/qf-hook off`.

## Supported frameworks

If your tests run with any of these, Qualflare has you covered.

**Unit** — `jest` · `mocha` · `golang` · `python` (pytest) · `rspec` · `phpunit` · `junit`

**BDD** — `cucumber` · `karate`

**End-to-end** — `playwright` · `cypress` · `selenium` · `testcafe`

**API** — `newman` · `k6`

**Security** — `zap` · `trivy` · `snyk` · `sonarqube`

Vitest results upload via the `jest` slug. Multi-framework monorepos work too — `/qf-init` detects each workspace and tracks them separately.

## Requirements

Before running `/qf-init`, make sure you have:

- [Claude Code](https://claude.ai/code) — the CLI or desktop app
- **Qualflare CLI (`qf`)** — installed and on your PATH (see below)
- `QF_API_KEY` — your API key set as an environment variable ([get one here](https://qualflare.com/settings/api-keys))

### Installing the Qualflare CLI

**macOS / Linux — Homebrew:**

```bash
brew install qualflare/tap/qf
```

**All platforms — binary download:**

Download the pre-built binary for your OS from [github.com/qualflare/qualflare-cli/releases](https://github.com/qualflare/qualflare-cli/releases), extract it, and place `qf` somewhere on your PATH.

**Docker:**

```bash
docker pull ghcr.io/qualflare/qf:latest
```

Verify the install with `qf version`. `/qf-run` will not continue until `qf` is on your PATH.

## When something's off

Run `/qf-doctor` first. It checks the three things that break most often:

- Is `qf` installed and available on your PATH?
- Is `QF_API_KEY` set?
- Is your `test-state.md` still current, or has the project drifted since setup?

Most issues are a missing CLI or a missing environment variable. Fix what the doctor flags and re-run.

## How it stores state

`/qf-init` creates a `.qualflare/` directory in your project root:

```
.qualflare/
├── test-state.md    # framework + file-count context — commit this
├── config.json      # hook preference — commit this
└── results/         # last-run output from qf upload — gitignore this
```

Add `.qualflare/results/` to your `.gitignore`. The other two files are meant to be committed — they give every session the context it needs without running setup again.

## Updating

Pull the latest version at any time:

```
/plugin update qualflare
```

## Contributing

Bug reports and pull requests are welcome — open an issue at [github.com/qualflare/qualflare-ai/issues](https://github.com/qualflare/qualflare-ai/issues).

For development notes — how to test the hook, how to add a new framework, how to cut a release — see [`CLAUDE.md`](./CLAUDE.md).

## License

Released under the MIT License. A `LICENSE` file will be added to the repository before the first tagged release.

---

[Qualflare](https://qualflare.com) · [Docs](https://qualflare.com/docs) · [CLI releases](https://github.com/qualflare/qualflare-cli/releases) · [Issues](https://github.com/qualflare/qualflare-ai/issues) · [Changelog](https://github.com/qualflare/qualflare-ai/releases)

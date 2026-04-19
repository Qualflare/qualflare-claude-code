# qualflare-ai — Developer Guide

## Purpose

`qualflare-ai` is an NPX setup wizard (`npx qualflare-ai`) that a developer runs once at their project root. It:

1. Detects the tech stack and test frameworks in use.
2. Writes `.qualflare/test-state.md` — a persistent state file the AI coding agent reads to understand the project's test topology.
3. Installs AI agent plugin files for Claude Code, Cursor, Codex CLI, Gemini CLI, and Continue.dev, enabling those agents to upload test results to Qualflare automatically.

## Tech Stack

| Tool | Role |
|------|------|
| Node 20+ | Runtime (ESM-only) |
| TypeScript 5.7 | Language |
| tsdown | Bundler (outputs `dist/cli.mjs`) |
| @clack/prompts | Interactive CLI prompts |
| cac | CLI argument parsing |
| eta | Template engine for generating agent plugin files |
| tinyglobby | Fast glob matching for file detection |
| yaml | YAML parsing/serialisation |
| smol-toml | TOML parsing (Cargo.toml, pyproject.toml) |
| fast-xml-parser | XML parsing (pom.xml, Maven/JUnit reports) |

## Directory Layout

```
src/
  cli.ts                  # Entry point — wires cac commands, starts wizard
  frameworks/
    slugs.ts              # Canonical framework slug list (mirrors Go models.go)
  detect/
    index.ts              # Orchestrates all detectors
    languages/            # One file per language (implements Detector interface)
      typescript.ts
      python.ts
      go.ts
      java.ts
      ruby.ts
      php.ts
      rust.ts
    frameworks/           # Optional per-framework detection helpers
  install/
    index.ts              # Orchestrates all installers
    claude.ts             # Claude Code installer (implements Installer interface)
    cursor.ts
    codex.ts
    gemini.ts
    continue.ts
  render/
    index.ts              # Renders eta templates to strings
    templates/            # *.eta template files for agent plugin files
  wizard/
    index.ts              # Main interactive wizard flow
    steps/                # One file per wizard step
  util/
    fs.ts                 # Safe file I/O helpers (respects marker blocks)
    markers.ts            # BEGIN/END marker block utilities
    git.ts                # Git root detection
```

## Key Invariants

### 1. Framework slug sync

`src/frameworks/slugs.ts` is the TypeScript mirror of the Go constants in:

```
/Users/ibrahim/Astrais/qualflare-cli/internal/core/domain/models.go
```

**Any time a framework is added or renamed in the Go file, `slugs.ts` MUST be updated to match exactly.** The slug strings must be identical character-for-character. A CI check (planned) will enforce this.

### 2. Never overwrite user files outside marker blocks

All file writes that touch existing user files must:
- Check for `<!-- BEGIN qualflare-ai -->` / `<!-- END qualflare-ai -->` marker blocks.
- Only write/replace content within those blocks.
- Leave all content outside the blocks untouched.

The `src/util/markers.ts` helpers enforce this. Never call `fs.writeFile` directly on user-owned files — always go through the util layer.

### 3. All installers must be idempotent

Running the wizard multiple times must produce the same result as running it once. Installers achieve this by:
- Detecting whether the plugin file already exists and contains up-to-date content.
- Updating only the marker block section if the file already exists.
- Never duplicating sections or prompts.

## Common Commands

```bash
# Build the CLI (outputs dist/cli.mjs)
pnpm build

# Run unit tests
pnpm test

# Type-check without emitting
pnpm typecheck

# Watch mode for development
pnpm dev

# Lint
pnpm lint
```

## How to Add a New Language Detector

1. Create `src/detect/languages/<language>.ts`.
2. Implement the `Detector` interface:

```ts
import type { Detector, DetectionResult } from '../types.js'

export const myLanguageDetector: Detector = {
  language: 'mylang',
  async detect(projectRoot: string): Promise<DetectionResult> {
    // Use tinyglobby to check for indicator files (e.g. pyproject.toml)
    // Return { detected: true, frameworks: [...slugs], confidence: 'high' | 'medium' | 'low' }
    // Return { detected: false } if the language is not present
  },
}
```

3. Register the detector in `src/detect/index.ts` by adding it to the `DETECTORS` array.
4. Add tests in `test/detect/<language>.test.ts`.

Notes:
- `projectRoot` is the absolute path to the user's project root (the git root or cwd).
- Use `tinyglobby` for file presence checks, not `fs.existsSync`, so that the globs are consistent and testable.
- If you detect a framework that is in `DETECTABLE_EXTRAS` (not a direct Qualflare slug), map it to `nearestSlug` and include a note in the result.

## How to Add a New Agent Installer

1. Create `src/install/<agent>.ts`.
2. Implement the `Installer` interface:

```ts
import type { Installer, InstallContext } from '../types.js'

export const myAgentInstaller: Installer = {
  agentId: 'my-agent',
  name: 'My Agent',
  async isPresent(projectRoot: string): Promise<boolean> {
    // Return true if the agent config directory / file is detected in the project
  },
  async install(ctx: InstallContext): Promise<void> {
    // Write/update the agent plugin file using src/util/markers.ts helpers
    // Must be idempotent — safe to call multiple times
  },
}
```

3. Register the installer in `src/install/index.ts` by adding it to the `INSTALLERS` array.
4. Add the corresponding eta template in `src/render/templates/<agent>.eta` if the installer generates a file from a template.
5. Add tests in `test/install/<agent>.test.ts`.

Notes:
- `InstallContext` includes `projectRoot`, `detectedFrameworks`, `qualflareProjectKey`, and `dryRun`.
- In dry-run mode, log what would be written but do not touch the filesystem.
- All file writes must go through `src/util/fs.ts` helpers to respect marker blocks.

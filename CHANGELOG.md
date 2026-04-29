# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.3] - 2026-04-29

### Fixed

- Replaced `readFileSync("./package.json")` with `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"))` in `apps/cli/src/index.ts` — the old relative path resolved against the caller's working directory at runtime, so the file was never found when the CLI was installed globally and invoked from an arbitrary directory

- Added `#!/usr/bin/env node` shebang as the first line of `apps/cli/src/index.ts` so the compiled `dist/index.js` is executed by Node.js rather than the shell when invoked as a CLI binary
- Added `chmod +x dist/index.js` to the `apps/cli` build script to ensure the binary has execute permission after compilation

---

## [0.1.2] - 2026-04-29

### Fixed

- Added explicit `"files": ["dist", "README.md"]` to all app and package `package.json` files so that `README.md` is reliably included in the npm tarball and rendered on the npm registry page for each package

---

## [0.1.1] - 2026-04-29

### Added

- `README.md` added to every app and package (`apps/cli`, `apps/mcp-server`, `apps/worker`, `packages/agent-core`, `packages/github-client`, `packages/jira-client`, `packages/shared`) with a description, key exports / capabilities, and a link back to the main repository README

---

## [0.1.0] - 2026-04-27

### Added

- `taskforge init` — interactive setup wizard generating `taskforge.config.json` and `.env`
- `taskforge start` — polling worker that watches Jira and processes assigned tickets
- `taskforge run <ticketId>` — single-ticket execution with optional `--dry-run` and `--debug` flags
- `taskforge list` — displays all tickets currently assigned to the agent user
- `taskforge mcp start / stop` — background MCP server lifecycle management with PID file tracking
- MCP server — Express HTTP bridge exposing Jira and GitHub tools to the agent worker
- Agent core — Anthropic SDK agentic loop with `bash`, `read_file`, and `write_file` tools
- Prompt caching — 1-hour ephemeral cache for repository context to reduce token costs
- Jira client — dynamic transition ID resolution (name → numeric ID)
- GitHub client — idempotent `createBranch` and `createPR` (handles 422 on duplicates)
- Git operations — clone, sync, checkout, commit-and-push, and local branch cleanup
- FSM-style ticket processing: spec clarification → approval gate → implementation → PR → review
- `taskforge.config.json` schema for agent behaviour and Jira workflow mappings
- Monorepo structure with pnpm workspaces (`apps/`, `packages/`)

### Architecture

```
taskforge CLI
  ├── worker          polling loop, FSM per ticket
  ├── mcp-server      HTTP bridge to Jira + GitHub APIs
  ├── agent-core      Claude API integration, git ops
  ├── jira-client     Jira REST API client
  ├── github-client   GitHub API client
  └── shared          types, ADF utilities
```

---

[0.1.4]: https://github.com/tomaszczechowski/taskforge/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/tomaszczechowski/taskforge/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/tomaszczechowski/taskforge/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/tomaszczechowski/taskforge/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tomaszczechowski/taskforge/releases/tag/v0.1.0

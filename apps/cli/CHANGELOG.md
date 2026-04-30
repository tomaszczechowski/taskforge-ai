# Changelog — @taskforge-ai/cli

All notable changes to this package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.6] - 2026-04-30

### Fixed

- `program.name()` updated from `taskforge` to `taskforge-ai` in `src/index.ts` — aligns the Commander program name with the bin key renamed in 0.1.6
- Stop hint in `mcp start` console output corrected from `taskforge mcp stop` to `taskforge-ai mcp stop`

---

## [0.1.5] - 2026-04-30

### Added

- `src/utils.ts` — `getConfig(path): TaskForgeConfig` helper that reads and parses `taskforge.config.json` with a typed return value

### Changed

- `start` and `run` commands now use `getConfig()` instead of inlining `JSON.parse(readFileSync(...))`
- `run --dry-run` passes `config.agents.list[0]` to `generatePlan` instead of the entire config object
- `CHANGELOG.md` added to `"files"` in `package.json` so the changelog is included in the published npm tarball

---

## [0.1.4] - 2026-04-29

### Fixed

- `--path` option defaults changed from `"./"` to `process.cwd()` so the resolved path is always absolute regardless of where the command is invoked from

---

## [0.1.3] - 2026-04-29

### Fixed

- Added `#!/usr/bin/env node` shebang as the first line of `src/index.ts` so the compiled `dist/index.js` is executed by Node.js rather than the shell
- Added `chmod +x dist/index.js` to the build script to ensure the binary has execute permission after compilation
- Fixed `package.json` version read — replaced `readFileSync("./package.json")` (resolves against `cwd`) with `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"))` (resolves relative to the script file)

---

## [0.1.2] - 2026-04-29

### Fixed

- Added `"files": ["dist", "README.md"]` to `package.json` so `README.md` is reliably included in the published npm tarball

---

## [0.1.1] - 2026-04-29

### Added

- `README.md` with command reference and link to the main repository README

---

## [0.1.0] - 2026-04-27

### Added

- `taskforge init` — interactive setup wizard generating `taskforge.config.json` and `.env`
- `taskforge start` — start the polling agent worker with `--path` and `--interval` options
- `taskforge run <ticketId>` — process a single ticket with optional `--dry-run` and `--debug` flags
- `taskforge list` — display all Jira tickets currently assigned to the agent user
- `taskforge mcp start / stop` — background MCP server lifecycle management with PID file tracking

---

[0.1.6]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/cli@0.1.5...@taskforge-ai/cli@0.1.6
[0.1.6]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/cli@0.1.5...@taskforge-ai/cli@0.1.6
[0.1.5]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/cli@0.1.4...@taskforge-ai/cli@0.1.5
[0.1.4]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/cli@0.1.3...@taskforge-ai/cli@0.1.4
[0.1.3]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/cli@0.1.2...@taskforge-ai/cli@0.1.3
[0.1.2]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/cli@0.1.1...@taskforge-ai/cli@0.1.2
[0.1.1]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/cli@0.1.0...@taskforge-ai/cli@0.1.1
[0.1.0]: https://github.com/tomaszczechowski/taskforge/releases/tag/@taskforge-ai/cli@0.1.0

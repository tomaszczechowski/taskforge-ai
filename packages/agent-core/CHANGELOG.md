# Changelog — @taskforge-ai/agent-core

All notable changes to this package are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.3] - 2026-04-30

### Changed

- `CHANGELOG.md` added to `"files"` in `package.json` so the changelog is included in the published npm tarball

---

## [0.1.2] - 2026-04-29

### Fixed

- Added `"files": ["dist", "README.md"]` to `package.json` so `README.md` is reliably included in the published npm tarball

---

## [0.1.1] - 2026-04-29

### Added

- `README.md` with exports reference and link to the main repository README

---

## [0.1.0] - 2026-04-27

### Added

- Anthropic SDK agentic loop for plan generation, spec summarisation, and code implementation
- `bash`, `read_file`, and `write_file` tools available to the agent during the implementation loop
- Prompt caching — 1-hour ephemeral cache for repository context to reduce token costs
- Git operations: clone, sync, branch checkout, commit-and-push, and local branch cleanup

---

[0.1.2]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/agent-core@0.1.1...@taskforge-ai/agent-core@0.1.2
[0.1.1]: https://github.com/tomaszczechowski/taskforge/compare/@taskforge-ai/agent-core@0.1.0...@taskforge-ai/agent-core@0.1.1
[0.1.0]: https://github.com/tomaszczechowski/taskforge/releases/tag/@taskforge-ai/agent-core@0.1.0

# Taskforge AI

> **Early stage project — not production-ready.** Taskforge is a proof-of-concept for end-to-end "vibe coding" — an AI agent that reads tickets from Jira, asks clarifying questions, writes the implementation, and opens a pull request on GitHub, with a human approving each step. The goal is to demonstrate what a fully autonomous developer loop looks like in practice, not to be production-ready software. The project has [known security and reliability issues](#known-weak-points) — including unprotected secrets handling and no concurrency safety — that must be addressed before any production use.

![Taskforge](logo-wordmark.svg)

<p align="center"><img src="logo.svg" alt="Taskforge Flow" width="300"/></p>

<p align="center"><img src="demo.gif" alt="Taskforge CLI demo" width="800" /></p>

> **Security & reliability notice.** This project is a proof-of-concept and has [known weak points](#known-weak-points) that make it unsuitable for production use without further hardening. Please review them before deploying.

---

## How it works

```
Jira ticket (assigned to agent)
  → Agent reads spec, posts clarifying questions as comments
  → Human replies, ends with "APPROVED FOR AGENT"
  → Agent generates implementation plan
  → Agent clones repo, writes code, commits, pushes
  → Agent opens PR, moves ticket to "In Review"
  → Human reviews and merges
```

The agent polls Jira on a configurable interval. Every step goes through a human approval gate — the agent never merges code on its own.

---

## Requirements

- Node.js 20+
- Anthropic API key
- Jira account with API token
- GitHub personal access token

---

## Installation

Install globally from npm:

```bash
npm install -g @taskforge-ai/cli
```

Or run any command without installing via `npx`:

```bash
npx @taskforge-ai/cli <command>
```

---

## Quickstart

```bash
npx @taskforge-ai/cli init
```

This runs an interactive setup wizard that creates `taskforge.config.json` and `.env` in your project directory.

***Before you run the below commands commit and push `taskforge.config.json` to you repository***

Then start both services:

```bash
npx @taskforge-ai/cli mcp start
npx @taskforge-ai/cli start
```

---

## CLI Reference

### `npx @taskforge-ai/cli init`

Interactive setup wizard. Creates `taskforge.config.json` and `.env` with your Jira, GitHub, and Anthropic credentials.

```bash
npx @taskforge-ai/cli init
```

---

### `npx @taskforge-ai/cli start`

Starts the polling agent worker. The agent watches Jira for tickets assigned to the configured agent user and processes them through the spec → approval → implementation flow.

```bash
npx @taskforge-ai/cli start [options]
```

| Option | Description | Default |
|---|---|---|
| `--path <path>` | Directory containing `taskforge.config.json` and `.env` | `./` |
| `--interval <seconds>` | Jira poll interval | `30` |

**Examples:**
```bash
npx @taskforge-ai/cli start
npx @taskforge-ai/cli start --path /my/project
npx @taskforge-ai/cli start --interval 60
```

---

### `npx @taskforge-ai/cli run <ticketId>`

Processes a single ticket immediately without starting the polling loop. Useful for testing or re-running a specific ticket.

```bash
npx @taskforge-ai/cli run <ticketId> [options]
```

| Option | Description | Default |
|---|---|---|
| `--path <path>` | Directory containing `taskforge.config.json` and `.env` | `./` |
| `--dry-run` | Generate implementation plan only — no code changes | `false` |
| `--debug` | Show verbose logs | `false` |

**Examples:**
```bash
npx @taskforge-ai/cli run SCRUM-42
npx @taskforge-ai/cli run SCRUM-42 --dry-run
npx @taskforge-ai/cli run SCRUM-42 --path /my/project --debug
```

---

### `npx @taskforge-ai/cli list`

Shows all Jira tickets currently assigned to the agent user, with their status.

```bash
npx @taskforge-ai/cli list
```

---

### `npx @taskforge-ai/cli mcp <action>`

Controls the MCP (middleware) server. The MCP server is a local HTTP bridge between the agent and the Jira/GitHub APIs.

```bash
npx @taskforge-ai/cli mcp start [options]
npx @taskforge-ai/cli mcp stop
```

| Option | Description | Default |
|---|---|---|
| `--path <path>` | Directory containing `.env` | `./` |
| `--port <port>` | Port to listen on | `3001` |

The server runs as a background daemon. Logs are written to `~/.taskforge/mcp.log`.

**Examples:**
```bash
npx @taskforge-ai/cli mcp start
npx @taskforge-ai/cli mcp start --port 3002
npx @taskforge-ai/cli mcp stop
```

---

## Configuration

`taskforge.config.json` controls agent behaviour and workflow mappings:

```json
{
  "agents": {
    "agentMarker": "🤖",
    "list": [
      {
        "name": "Agent Tomasz",
        "poolingInterval": 30000,
        "llmModel": {
          "discussion": "claude-sonnet-4-6",
          "implementation": "claude-sonnet-4-6"
        },
        "comments": {
          "searchTextFor": {
            "approved": "APPROVED",
            "waitingForAgentInput": "WAITING FOR AGENT INPUT"
          }
        },
        "specAreas": {
          "expected": "What is the expected behavior?",
          "edge": "Are there edge cases or constraints?",
          "api": "Should this expose or modify any API?",
          "ui": "Is there any UI/UX requirement?"
        }
      }
    ]
  },
  "source": {
    "type": "jira",
    "workflow": {
      "prCreated": "IN_REVIEW"
    }
  }
}
```

Secrets (tokens, API keys) go in `.env` — never in the config file.

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `JIRA_URL` | Jira instance URL |
| `JIRA_EMAIL` | Jira account email |
| `JIRA_TOKEN` | Jira API token |
| `GITHUB_TOKEN` | GitHub personal access token |
| `GITHUB_REPO` | Target repo in `owner/repo` format |
| `GITHUB_REPO_MAIN_BRANCH` | Main branch name |
| `LOCAL_REPO_PATH` | Local path where the repo is cloned |
| `JIRA_USER_NAME` | Jira assignee name the agent watches |
| `MCP_URL` | MCP server URL (default: `http://localhost:3001/tool`) |

---

## Jira workflow

The agent expects tickets to move through these statuses:

```
To Do → In Progress → In Review
```

The approval gate is comment-based:
- Human replies **`APPROVED FOR AGENT`** → agent starts implementation
- Human replies **`WAITING FOR AGENT INPUT`** → agent re-analyses the spec

---

## Architecture

```
taskforge CLI
  ├── worker          polling loop, FSM per ticket
  ├── mcp-server      HTTP bridge to Jira + GitHub APIs
  ├── agent-core      Claude API integration, git ops
  ├── jira-client     Jira REST API client
  ├── github-client   GitHub API client
  └── shared          types, ADF utilities
```

The agent loop is built directly on the Anthropic SDK — no LangChain or similar frameworks. The MCP server is a thin Express layer that the worker calls over HTTP.

## Packages

| Package | Version | Description |
|---|---|---|
| [`@taskforge-ai/cli`](https://www.npmjs.com/package/@taskforge-ai/cli) | ![npm](https://img.shields.io/npm/v/@taskforge-ai/cli?style=flat-square&color=9F7AEA) | CLI entry point — `init`, `start`, `run`, `list`, `mcp` commands |
| [`@taskforge-ai/worker`](https://www.npmjs.com/package/@taskforge-ai/worker) | ![npm](https://img.shields.io/npm/v/@taskforge-ai/worker?style=flat-square&color=9F7AEA) | Polling worker that drives the spec → approval → implementation FSM |
| [`@taskforge-ai/mcp-server`](https://www.npmjs.com/package/@taskforge-ai/mcp-server) | ![npm](https://img.shields.io/npm/v/@taskforge-ai/mcp-server?style=flat-square&color=9F7AEA) | Local HTTP bridge exposing Jira and GitHub tools to the agent |
| [`@taskforge-ai/agent-core`](https://www.npmjs.com/package/@taskforge-ai/agent-core) | ![npm](https://img.shields.io/npm/v/@taskforge-ai/agent-core?style=flat-square&color=9F7AEA) | Anthropic SDK agentic loop — plan generation, spec summarisation, code implementation |
| [`@taskforge-ai/jira-client`](https://www.npmjs.com/package/@taskforge-ai/jira-client) | ![npm](https://img.shields.io/npm/v/@taskforge-ai/jira-client?style=flat-square&color=9F7AEA) | Jira REST API v3 client — issue fetching, commenting, workflow transitions |
| [`@taskforge-ai/github-client`](https://www.npmjs.com/package/@taskforge-ai/github-client) | ![npm](https://img.shields.io/npm/v/@taskforge-ai/github-client?style=flat-square&color=9F7AEA) | GitHub API client — branch and pull request management |
| [`@taskforge-ai/shared`](https://www.npmjs.com/package/@taskforge-ai/shared) | ![npm](https://img.shields.io/npm/v/@taskforge-ai/shared?style=flat-square&color=9F7AEA) | Shared types, ADF utilities, and logger used across the monorepo |

---

## Status

This project is in early development. Things that are known to be rough:

- Only Jira is supported as a ticket source (Linear, Trello planned)
- No UI dashboard yet — everything is CLI-driven
- Error recovery is minimal — a crashed agent requires manual restart
- No test suite

---

## Known Weak Points

The table below documents known security, reliability, and correctness issues. Contributions to fix them are welcome.

| Severity | Area | Issue |
|---|---|---|
| **Critical** | Security | `git add -A` in `commitAndPush` stages everything, including `.env` if it lives inside `LOCAL_REPO_PATH`. Secrets could be committed and pushed. |
| **Critical** | Security | GitHub token is injected directly into the clone URL (`https://<token>@...`). It appears in `git remote -v`, process listings, and error messages. Use a credential helper instead. |
| **Critical** | Security | MCP server has no authentication — any process on the machine can call it and invoke Jira/GitHub APIs freely. |
| **High** | Concurrency | All tickets are processed in parallel via `Promise.allSettled`, but git operations share a single `LOCAL_REPO_PATH`. Two tickets running simultaneously will conflict on `git checkout` and `git stash`. |
| **High** | Reliability | No FSM state is persisted — if the worker crashes mid-implementation, the ticket stays "In Progress" with no record of progress. The next poll may attempt re-implementation from scratch. |
| **High** | Reliability | `git stash --include-untracked` in `checkoutBranch` is never popped on failure, leaving a dangling stash entry. |
| **High** | Reliability | No retry logic on any I/O path - a single transient Jira, GitHub, or Claude timeout fails the entire ticket with no recovery. |
| **High** | Scaleability | Single Agent run in one process, with hardcoded index = 0 in @taskforge-ai/cli |
| **Medium** | Agent | The agent tends to modify more code than a ticket requires — it may refactor surrounding code, rename things, or touch unrelated files. Scope is not enforced; the model relies solely on the prompt instruction to "focus only on requirements". A diff-size budget or a file-allowlist derived from `files_to_modify` would help constrain it. |
| **Medium** | Config | Worker reads `config.agents.list[n].poolingInterval` but the config type defines `interval`. If the field is `undefined`, `sleep(NaN)` resolves immediately and spins the loop. |
| **Medium** | Reliability | The 40-turn agent loop has no wall-clock timeout — a hung model response blocks the worker indefinitely. |
| **Medium** | Code | `process.stdout.write(".")` in `applyChanges` bypasses the logger and always writes to stdout. |
| **Low** | Code | `runTests()` is fully implemented but commented out — dead code with no tracking issue. |
| **Low** | Code | `(body as any).includes(...)` in `processor.ts` — type-unsafe; should be properly narrowed. |

---

## Author

**Tomasz Czechowski**

- Linkedin [@tomaszczechowski](https://www.linkedin.com/in/tomaszczechowski/)
- GitHub: [@tomaszczechowski](https://github.com/tomaszczechowski)
- X: [@t_czechowski](https://x.com/t_czechowski)

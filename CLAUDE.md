# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shyft CLI (`@shyft/cli`) — a TypeScript CLI tool for authenticating and interacting with the Shyft platform API (`https://api.shyft.dev`). Built with Commander.js, uses Bun as package manager and test runner.

## Common Commands

```bash
bun install          # Install dependencies
bun run build        # Build with tsup + make bin executable
bun run dev          # Watch mode (tsup --watch)
bun test             # Run tests (Bun test runner)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint src/**/*.ts --fix
```

To run a single test file: `bun test src/lib/config.spec.ts`

## Architecture

**Entry flow:** `bin/shyft.js` → `src/index.ts:run()` → Commander.js parses args → command handler executes.

### Commands (`src/commands/`)
Each file exports a Commander `Command` instance. Commands registered in `src/index.ts`:
- **login** — Browser OAuth flow (poll-based) or `--api-key` for CI
- **logout** — Clears stored credentials
- **status** — Shows current auth state
- **config** — Get/set/reset config; subcommands: `get <key>`, `set <key> <value>`, `reset`

### Core Libraries (`src/lib/`)
- **api-client.ts** — Axios singleton with two variants: `getPublicApiClient()` (no auth) and `getApiClient()` (requires auth). Custom `ApiClientError` with structured error handling.
- **auth-flow.ts** — Two auth strategies: browser OAuth (create session → open URL → poll → claim token) and API key validation via `GET /auth/me`.
- **config.ts** — `ConfigManager` class (singleton via `getConfigManager()`). File-based config at `~/.shyft/config.json`. Supports both `accessToken` and `apiKey` auth modes.
- **constants.ts** — Exit codes (0-6), config paths, default API URL.

### Utilities (`src/utils/`)
- **output.ts** — Global `jsonMode` flag (set by `--json`). Functions: `output()`, `success()`, `error()`, `info()`. JSON mode suppresses human-friendly messages.
- **spinner.ts** — Ora wrapper, auto-disabled in JSON mode.
- **open-browser.ts** — Browser URL opener.

### Key Patterns
- **All commands support `--json`** for machine-readable output. The `preAction` hook on the program sets the global JSON mode flag.
- **Config is file-based** at `~/.shyft/config.json`, created lazily. API URL is configurable via `SHYFT_API_URL` env var or `config set apiUrl`.
- **Exit codes** are semantic (AUTH_REQUIRED=2, AUTH_FAILED=3, API_ERROR=4, etc.) — use them from `EXIT_CODES` constant.

## Testing

Tests use Bun's native test runner with `describe`/`test`/`expect` from `bun:test`. Test files are colocated as `*.spec.ts`. Tests use temp directories for file system isolation.

## Build

ES modules only (`"type": "module"`). tsup bundles `src/index.ts` → `dist/` targeting Node 18+. TypeScript strict mode enabled.

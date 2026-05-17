# @shyft-dev/cli

> [!IMPORTANT]
> Shyft is in Early Access. If you are interested in how your team can accelerate and measure AI-First development, please [join us](https://www.shyft.dev).

Command-line interface for the Shyft platform.

## Installation

```bash
npm install -g @shyft-dev/cli
```

To uninstall:

```bash
npm uninstall -g @shyft-dev/cli
```

Node 18+ and npm are the only requirements.

### Local development install

```bash
git clone git@github.com:shyft-dev/shyft-cli.git
cd shyft-cli
bun install
bun run build
bun link
```

## Usage

```bash
shyft [options] [command]
```

### Global Options

| Option      | Description              |
|-------------|--------------------------|
| `--json`    | Output in JSON format    |
| `-V`        | Show version number      |
| `-h`        | Show help                |

### Commands

#### `login`

Authenticate with the Shyft platform. Opens a browser by default for OAuth authentication.

```bash
# Browser-based login (default)
shyft login

# Print the auth URL instead of opening a browser
shyft login --no-browser

# Authenticate with an API key (for CI/scripts)
shyft login --api-key <key>
```

#### `logout`

Log out and clear stored credentials.

```bash
shyft logout
```

#### `status`

Show current authentication status including email, team, and auth method.

```bash
shyft status
```

#### `config`

View or modify CLI configuration.

```bash
# View all configuration (sensitive values redacted)
shyft config

# Get a specific value
shyft config get <key>

# Set a value (currently only apiUrl is settable)
shyft config set apiUrl https://custom-api.example.com

# Reset configuration to defaults (preserves auth)
shyft config reset
```

## Configuration

### User configuration (`~/.shyft/config.json`)

Stores authentication credentials and API settings. Created by `shyft login`. The API endpoint defaults to `https://api.shyft.dev` and can be overridden via:

- `shyft config set apiUrl <url>`
- The `SHYFT_API_URL` environment variable

### Project configuration (`.shyft/config.json`)

Created by `shyft init`. Associates the current project directory with a Shyft product. Contains the `productId` used by commands like `shyft features` and `shyft analytics`. This file should be committed to version control so all contributors share the same product association.

### Project context (`.shyft/context.json`)

Transient working state for the current session. Stores the active feature ID (set via `shyft context set --feature <id>`) and phase timing data (managed by `shyft analytics start-phase` / `end-phase`). This file is automatically added to `.gitignore` by `shyft init` and should not be committed.

## JSON Mode

All commands support `--json` for machine-readable output, useful for scripting and CI pipelines:

```bash
shyft status --json
shyft login --api-key "$SHYFT_API_KEY" --json
```

## Development

```bash
# Watch mode
bun run dev

# Build
bun run build

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint
```

## Exit Codes

| Code | Meaning          |
|------|------------------|
| 0    | Success          |
| 1    | General error    |
| 2    | Auth required    |
| 3    | Auth failed      |
| 4    | API error        |
| 5    | Validation error |
| 6    | Timeout          |

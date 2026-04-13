# @shyft-dev/cli

Command-line interface for the Shyft platform.

## Installation

Install the latest release directly from GitHub (pin to a released tag):

```bash
npm install -g github:shyft-dev/shyft-cli#v0.4.1 --install-links
```

This requires access to the `shyft-dev/shyft-cli` repository. Node 18+ and
npm are the only requirements.

> The `--install-links` flag is required. Without it, npm 10 creates a
> broken symlink to a temporary cache directory when installing scoped
> packages globally from git URLs ([npm/cli#4421](https://github.com/npm/cli/issues/4421)).
> This flag forces npm to copy package files instead.

### For beta testers

Always pin to a released tag (e.g. `#v0.2.0`) rather than installing from
`main`. To upgrade, rerun the install command with the new tag.

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

Configuration is stored at `~/.shyft/config.json`. The API endpoint defaults to `https://api.shyft.dev` and can be overridden via:

- `shyft config set apiUrl <url>`
- The `SHYFT_API_URL` environment variable

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

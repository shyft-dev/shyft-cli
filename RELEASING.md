# Releasing `@shyft-dev/cli`

Maintainer guide for cutting a new release of the Shyft CLI to the public npm registry.

The repository ships two release paths:

- **GitHub Actions** (recommended) — `Release` workflow publishes via npm
  trusted publishing (OIDC). No long-lived `NPM_TOKEN` required.
- **Local script** (`scripts/release.sh`) — manual fallback that publishes
  from a maintainer's machine using their own npm credentials.

Both paths produce the same artifacts: a git tag, a GitHub Release with
auto-generated notes, and a published npm package.

## Prerequisites

### One-time, per project
- `shyft-dev` npm org exists and the package `@shyft-dev/cli` is configured
  for trusted publishing from this repository's `Release` workflow
  (Settings → Packages → Trusted Publishers on npmjs.com).
- Repository is public on GitHub.
- `LICENSE` (MIT) is present at repo root.

### One-time, per maintainer (local releases only)
- `npm login` against the `shyft-dev` org with 2FA enabled.
- `gh auth login` with permission to push to `main` and create releases.
- npm >= 11.5.1 (required for `--provenance` on local publish; the CI
  workflow upgrades npm automatically).

## Versioning

Follow [semver](https://semver.org/):

| Bump  | When to use                                                       |
|-------|-------------------------------------------------------------------|
| patch | Bug fixes, doc-only changes, internal refactors                   |
| minor | New backwards-compatible features, new commands or flags          |
| major | Breaking changes to commands, flags, config schema, or exit codes |

Pre-1.0 caveat: while the package is `0.x.y`, treat **minor** as the breaking-change bump and **patch** as everything else. Reserve **major**
(→ `1.0.0`) for the stability commitment.

## Releasing via GitHub Actions (recommended)

1. Confirm `main` is green and contains all the changes you want to ship.
2. Open the **Actions → Release** workflow.
3. Click **Run workflow**, choose `patch` / `minor` / `major` / `current`,
   and run it from the `main` branch.
4. The workflow:
   - Installs deps, typechecks, runs tests, and does a sanity build.
   - For `patch` / `minor` / `major`: runs `npm version <bump>` (creates
     the version commit and `vX.Y.Z` tag).
   - For `current`: skips `npm version` and tags whatever version is
     already committed in `package.json` (fails if the tag already
     exists).
   - Pushes the commit (if any) and tag to `origin/main`.
   - Creates a GitHub Release with auto-generated notes.
   - Publishes to npm with `--provenance --access public` via OIDC.
5. Verify (see "After releasing" below).

Use `current` when the desired version is already committed to `main` —
for example, the first public `0.1.0` release after resetting the
version, or any time a maintainer hand-bumped `package.json` in a PR
rather than letting the release workflow do it.

If the workflow fails after the version commit was pushed but before npm
publish succeeded, see "Recovering from a failed release."

## Releasing locally (fallback)

Use this only when CI is unavailable.

```bash
bun run release patch   # or: minor, major
```

The script (`scripts/release.sh`) refuses to run unless:
- the working tree is clean,
- the current branch is `main`,
- local `main` matches `origin/main`.

It then runs typecheck → tests → build, bumps the version, pushes the
commit and tag, creates the GitHub Release, and runs `npm publish`. The
`prepare` script rebuilds `dist/` immediately before npm packs the
tarball, so end users always receive a fresh build.

## After releasing

Sanity-check the published artifact:

```bash
# Confirms the new version is on the registry
npm view @shyft-dev/cli version

# Installs the published tarball into a throwaway prefix and runs it
mkdir -p /tmp/shyft-release-check && cd /tmp/shyft-release-check
npm install --prefix . @shyft-dev/cli@latest
./node_modules/.bin/shyft --version
```

Also confirm:
- The GitHub Release page exists at `https://github.com/shyft-dev/shyft-cli/releases/tag/vX.Y.Z`.
- The npm page lists the new version: `https://www.npmjs.com/package/@shyft-dev/cli`.
- Provenance shows on the npm page (a "Built and signed on GitHub Actions"
  badge appears for releases published via the workflow).

## Recovering from a failed release

**Failure before the version commit was pushed** — nothing to clean up.
Fix the cause and re-run.

**Failure after the version commit/tag pushed, before npm publish**:

```bash
# From a clean checkout of main
git pull origin main --tags
npm publish --provenance --access public   # republish manually
```

The version commit + tag are durable; only the npm upload is missing.
Do **not** delete the tag and try to re-bump — npm versions are immutable
even after a deprecate/unpublish.

**Bad code shipped to npm** — prefer a follow-up patch release over
unpublishing. If a release must be withdrawn within the 72-hour
unpublish window:

```bash
npm unpublish @shyft-dev/cli@X.Y.Z
```

Otherwise, deprecate it so installers see a warning:

```bash
npm deprecate @shyft-dev/cli@X.Y.Z "Use X.Y.(Z+1) — fixes <reason>"
```

Then ship the fix as a normal patch release.

## Notes on the build pipeline

- `dist/` is gitignored. The published tarball is built fresh during
  `npm publish` via the `prepare` script. End users installing from the
  npm registry never run a build — they receive the pre-built tarball.
- The `files` field in `package.json` controls what ends up in the
  tarball (`dist`, `bin`, `README.md`, `LICENSE`). Anything outside that
  list is excluded regardless of what's in the working tree.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, and build on
  every push to `main` and every PR. Treat a red `main` as a release
  blocker.

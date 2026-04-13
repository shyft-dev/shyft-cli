#!/usr/bin/env bash
#
# Release script for @shyft-dev/cli.
#
# Usage:
#   bun run release patch   # 0.1.0 -> 0.1.1
#   bun run release minor   # 0.1.0 -> 0.2.0
#   bun run release major   # 0.1.0 -> 1.0.0
#
# Produces a git tag and a GitHub Release. Requires gh CLI to be
# authenticated.

set -euo pipefail

BUMP="${1:-}"

if [[ -z "$BUMP" ]]; then
  echo "Usage: bun run release <patch|minor|major>" >&2
  exit 1
fi

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Error: bump must be patch, minor, or major (got: $BUMP)" >&2
  exit 1
fi

# 1. Verify clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  git status --short
  exit 1
fi

# 2. Verify on main and up to date with origin
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must release from main branch (current: $BRANCH)" >&2
  exit 1
fi

git fetch origin main --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "Error: local main is not in sync with origin/main." >&2
  echo "  local:  $LOCAL" >&2
  echo "  remote: $REMOTE" >&2
  exit 1
fi

# 3. Typecheck
echo "==> Typechecking..."
bun run typecheck

# 4. Tests
echo "==> Running tests..."
bun test

# 5. Bump version in package.json (no commit/tag yet — must happen before build
#    so tsup injects the new version into dist/ via __CLI_VERSION__)
echo "==> Bumping version ($BUMP)..."
npm version "$BUMP" --no-git-tag-version

NEW_VERSION="$(node -p "require('./package.json').version")"
TAG="v$NEW_VERSION"

# 6. Build dist/ (committed to repo so git-installs work without a prepare step)
echo "==> Building $TAG..."
bun run build

# 7. Commit version bump + built dist/, then tag
echo "==> Committing release $TAG..."
git add package.json dist/
git commit -m "chore: release $TAG"
git tag -a "$TAG" -m "release $TAG"

echo "==> Pushing commit and tag $TAG..."
git push origin main
git push origin "$TAG"

# 8. Create GitHub Release
echo "==> Creating GitHub Release..."
gh release create "$TAG" --generate-notes --title "$TAG"

# 9. Publish to npm (enable at public launch)
# echo "==> Publishing to npm..."
# npm publish

echo ""
echo "Released $TAG"
echo "Install with: npm install -g github:shyft-dev/shyft-cli#$TAG"

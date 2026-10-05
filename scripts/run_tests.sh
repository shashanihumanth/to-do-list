#!/usr/bin/env bash
set -euo pipefail

# One test entrypoint; CI runs exactly this. Agents run it too, never bare `vitest`.

# Deterministic environment: UTC, isolated temp home, no ambient credentials.
export TZ=UTC
export HOME="${TMPDIR:-/tmp}/to-do-list-test-home"
mkdir -p "$HOME"

# Drop credentials so tests cannot silently depend on the ambient environment.
unset GITHUB_TOKEN GH_TOKEN NPM_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY 2>/dev/null || true

exec npx vitest run "$@"

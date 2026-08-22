#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
verify="$repo_root/scripts/verify-workmate-xxl-overlay.sh"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

expect_rejected() {
  local label="$1"
  local pattern="$2"
  local target="$3"
  local original="$scratch/original"
  cp "$target" "$original"
  printf '\n%s\n' "$pattern" >>"$target"
  if bash "$verify" >"$scratch/${label}.out" 2>&1; then
    cp "$original" "$target"
    echo "FAIL: ${label} mutation passed preflight" >&2
    exit 1
  fi
  cp "$original" "$target"
}

bash "$verify" >"$scratch/baseline.out"
expect_rejected personal-route '      PERSONAL_UPSTREAM=bots.workmateos.co.uk' "$repo_root/infra/workmate/docker-compose.xxl.yml"
expect_rejected provider-key '      OPENROUTER_API_KEY=forbidden' "$repo_root/infra/workmate/rakazo.env.example"
expect_rejected composio-key '      COMPOSIO_API_KEY=forbidden' "$repo_root/infra/workmate/rakazo.env.example"
expect_rejected public-port '      - "0.0.0.0:3100:3100"' "$repo_root/infra/workmate/docker-compose.xxl.yml"
echo 'PASS: rejection checks'

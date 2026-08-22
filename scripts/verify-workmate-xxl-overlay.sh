#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/workmate/docker-compose.xxl.yml"
caddy_file="$repo_root/infra/workmate/Caddyfile.rakazo-admin.snippet"
env_example="$repo_root/infra/workmate/rakazo.env.example"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[[ -f "$compose_file" ]] || fail "WorkMate compose overlay is missing"
[[ -f "$caddy_file" ]] || fail "WorkMate Caddy snippet is missing"
[[ -f "$env_example" ]] || fail "operator environment template is missing"

for service in api worker web; do
  grep -Eq "^  ${service}:$" "$compose_file" || fail "missing ${service} service"
done

grep -Fqx '      RAKAZO_INTEGRATION_MODE: workmate' "$compose_file" || fail "API must force WorkMate integration mode"
grep -Fq 'WORKMATE_RAKAZO_ENV_FILE:?Set an operator-owned environment file outside this checkout' "$compose_file" || fail "operator environment file is not required"
grep -Fq 'SANDBOX_PROVIDER: e2b' "$compose_file" || fail "E2B provider is not pinned"
grep -Fq 'DATABASE_URL=' "$env_example" || fail "Managed Supabase application database is undocumented"
grep -Fq 'WORKMATE_RAKAZO_DATABASE_URL=' "$env_example" || fail "private Rakazo authority is undocumented"
grep -Fq 'WORKMATE_RAKAZO_ASSERTION_SECRET=' "$env_example" || fail "WorkMate assertion secret is undocumented"

if grep -Eq '^  postgres:|postgres:16|pgdata:|POSTGRES_' "$compose_file"; then
  fail "overlay must not define a local PostgreSQL authority"
fi
if grep -Eq '(^|[^0-9])0\.0\.0\.0:|(^|[^0-9])80:|(^|[^0-9])443:' "$compose_file"; then
  fail "overlay publishes a non-loopback listener"
fi
grep -Fqx '      - "127.0.0.1:23100:3100"' "$compose_file" || fail "API listener is not loopback-only"
grep -Fqx '      - "127.0.0.1:25173:5173"' "$compose_file" || fail "web listener is not loopback-only"
echo 'PASS: loopback-only listeners'

grep -Fqx 'handle_path /saas-admin/rakazo/* {' "$caddy_file" || fail "SaaS Admin path mount is missing"
grep -Fqx $'\treverse_proxy 127.0.0.1:25173' "$caddy_file" || fail "Caddy does not target internal web listener"
if grep -hEv '^[[:space:]]*#' "$compose_file" "$caddy_file" "$env_example" | grep -Eq '(^|[^[:alnum:]_.-])bots\.workmateos\.co\.uk([^[:alnum:]_.-]|$)'; then
  fail "personal Rakazo deployment is referenced"
fi
if grep -hEv '^[[:space:]]*#' "$compose_file" "$env_example" | grep -Eq '^[[:space:]]*(OPENROUTER_API_KEY|COMPOSIO_API_KEY|BETTER_AUTH_[A-Z_]*|PI_DEFAULT_(PROVIDER|MODEL))'; then
  fail "direct provider, Composio, or independent auth configuration is present"
fi

echo 'PASS: WorkMate Rakazo XXL overlay preflight'

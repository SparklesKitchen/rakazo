#!/usr/bin/env bash
set -euo pipefail

config_path="${1:-infra/workmate/Caddyfile.rakazo}"
rg -F 'handle /saas-admin/rakazo/rpc*' "$config_path"
rg -F 'uri strip_prefix /saas-admin/rakazo' "$config_path"
rg -F 'reverse_proxy 127.0.0.1:3110' "$config_path"
rg -F 'handle /saas-admin/rakazo/*' "$config_path"
rg -F 'reverse_proxy 127.0.0.1:5174' "$config_path"

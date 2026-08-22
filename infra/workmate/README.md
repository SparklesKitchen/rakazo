# WorkMate Rakazo XXL overlay

This directory prepares a separate internal service for CHR-204. It is not the
upstream public Rakazo Compose deployment and must not be installed in, pointed
at, or combined with Chris's personal `/opt/rakazo` service.

The operator supplies an external mode-0600 environment file and a full commit
SHA. The file must contain only the private Managed Supabase connection strings,
the WorkMate assertion secret, and the E2B key shown in `rakazo.env.example`.
Do not put `OPENROUTER_API_KEY`, `COMPOSIO_API_KEY`, Better Auth settings,
`PI_DEFAULT_PROVIDER`, or `PI_DEFAULT_MODEL` there: WorkMate mode rejects them.

Run the preflight before any host change:

```bash
bash scripts/verify-workmate-xxl-overlay.sh
bash scripts/test-workmate-xxl-overlay.sh
```

The compose overlay exposes API `23100` and web `25173` on loopback only. Add
`Caddyfile.rakazo-admin.snippet` inside the existing authenticated
`workmateos.co.uk` site block; it mounts the web process under
`/saas-admin/rakazo/` and creates no standalone host. Its required WorkMate
handoff, base-path browser contract, live Caddy validation, owner-tenant proof,
and disposable proof-data cleanup are deployment gates, not implied by this
preparation work.

# Gates: CHR-204 leaf 04 — WorkMate XXL deployment preparation

Scope: A no-secret, WorkMate-owned Rakazo production overlay and runnable preflight for an internal XXL service. This leaf does not deploy, alter `/opt/rakazo`, or prove the live owner journey.

- [x] G1: The overlay runs only WorkMate-mode API, worker, and web services against operator-provided Managed Supabase authority; it defines no local PostgreSQL authority.
  CHECK: bash scripts/verify-workmate-xxl-overlay.sh
  EXPECT: PASS: WorkMate Rakazo XXL overlay preflight
  EVIDENCE: PASS: loopback-only listeners | PASS: WorkMate Rakazo XXL overlay preflight

- [x] G2: API and web listeners are loopback-only, and the Caddy include mounts the service at `/saas-admin/rakazo/` without a standalone host.
  CHECK: bash scripts/verify-workmate-xxl-overlay.sh
  EXPECT: PASS: loopback-only listeners
  EVIDENCE: PASS: loopback-only listeners | PASS: WorkMate Rakazo XXL overlay preflight

- [x] G3: The preflight rejects personal deployment routing, public host ports, and direct provider/Composio configuration.
  CHECK: bash scripts/test-workmate-xxl-overlay.sh
  EXPECT: PASS: rejection checks
  EVIDENCE: PASS: rejection checks

- [x] G4: Leaf 04 reflects preparation evidence only; live deployment, authenticated XXL proof, and cleanup remain visibly unclaimed.
  EVIDENCE: `/Users/chrismarkert/workmate-os/gates/04-integration.md` records only the 2026-08-22 overlay/preflight results and explicitly leaves I1–I3 unproven.

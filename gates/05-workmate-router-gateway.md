# Gates: CHR-204 leaf 05 — Pi WorkMate Router gateway

- [ ] G1: In WorkMate production mode, Pi sends every model request only to the configured internal WorkMate Router endpoint using the per-run short-lived WorkMate assertion; it does not resolve a direct provider/OAuth key.
  CHECK: pnpm --filter @rakazo/adapters test -- pi-runtime.test.ts
  EXPECT: WorkMate Router gateway tests pass
  EVIDENCE: pending

- [ ] G2: Gateway output is accepted only when it contains non-empty text and telemetry correlated to the exact Rakazo run and trace IDs; malformed, mismatched, or unavailable responses fail closed.
  CHECK: pnpm --filter @rakazo/adapters test -- pi-runtime.test.ts
  EXPECT: WorkMate Router gateway tests pass
  EVIDENCE: pending

- [ ] G3: Existing upstream Pi behavior and connector tool-name normalization remain covered.
  CHECK: pnpm --filter @rakazo/adapters test -- pi-runtime.test.ts
  EXPECT: all tests pass
  EVIDENCE: pending

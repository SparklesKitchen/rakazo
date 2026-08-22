import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blockedAuthPaths, verifyWorkMateAssertion } from "./index.js";

const assertionKey = "workmate-test-signing-secret";

function assertion(claims: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${createHmac("sha256", assertionKey).update(payload).digest("base64url")}`;
}

describe("auth policy", () => {
  it("blocks invitation and org-creation paths in version 1", () => {
    expect(blockedAuthPaths.some((p) => p.includes("invite"))).toBe(true);
    expect(blockedAuthPaths.some((p) => p.includes("create"))).toBe(true);
  });
});

describe("WorkMate assertion policy", () => {
  const now = 1_700_000_000_000;
  const base = {
    iss: "workmate-os",
    aud: "workmate-rakazo",
    kind: "admin-door",
    jti: "handoff-1",
    adminSessionId: "admin-session-1",
    adminUserId: "admin-user-1",
    adminEmail: "owner@workmateos.co.uk",
    tenantId: "tenant-1",
    iat: Math.floor(now / 1000) - 10,
    exp: Math.floor(now / 1000) + 60,
  };

  it("accepts only a currently valid assertion signed by WorkMate", () => {
    expect(verifyWorkMateAssertion(assertion(base), assertionKey, now)).toMatchObject({
      tenantId: "tenant-1",
    });
  });

  it("rejects tampering, expired assertions, wrong audiences, and long-lived sessions", () => {
    expect(verifyWorkMateAssertion(`${assertion(base)}x`, assertionKey, now)).toBeNull();
    expect(verifyWorkMateAssertion(assertion({ ...base, exp: Math.floor(now / 1000) - 1 }), assertionKey, now)).toBeNull();
    expect(verifyWorkMateAssertion(assertion({ ...base, aud: "other-service" }), assertionKey, now)).toBeNull();
    expect(verifyWorkMateAssertion(assertion({ ...base, exp: base.iat + 901 }), assertionKey, now)).toBeNull();
  });
});

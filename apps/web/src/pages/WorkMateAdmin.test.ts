import { describe, expect, it } from "vitest";
import { tenantFromHandoff } from "./WorkMateAdmin";

describe("Rakazo WorkMate handoff", () => {
  it("reads the tenant from WorkMate's signed payload segment", () => {
    const payload = Buffer.from(JSON.stringify({ tenantId: "owner-tenant" })).toString("base64url");
    expect(tenantFromHandoff(`${payload}.signature`)).toBe("owner-tenant");
  });

  it("fails closed for a malformed handoff", () => {
    expect(tenantFromHandoff("not-an-assertion")).toBe("");
  });
});

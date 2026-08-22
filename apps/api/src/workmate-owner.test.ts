import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { workMateActorFromAssertion } from "./workmate-owner.js";

const secret = "workmate-rakazo-test-secret";

function assertion(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

describe("WorkMate Rakazo owner actor", () => {
  it("maps only a valid SaaS Admin handoff to the WorkMate owner actor", () => {
    const now = Math.floor(Date.now() / 1000);
    const actor = workMateActorFromAssertion(assertion({
      iss: "workmate-os", aud: "workmate-rakazo", kind: "admin-door",
      iat: now, exp: now + 300,
      jti: "assertion-1", adminSessionId: "admin-session-1",
      adminUserId: "137e2f30-ff48-46f7-a3df-881cfb099c80",
      adminEmail: "chris@workmateos.co.uk", tenantId: "12c07c2b-edfd-4516-8dd6-e4397e88d532",
    }), secret);
    expect(actor).toMatchObject({
      userId: "137e2f30-ff48-46f7-a3df-881cfb099c80",
      workspaceId: "12c07c2b-edfd-4516-8dd6-e4397e88d532",
      isDeploymentOwner: true,
    });
  });

  it("rejects malformed or non-admin WorkMate assertions", () => {
    expect(workMateActorFromAssertion("bad", secret)).toBeNull();
    expect(workMateActorFromAssertion(assertion({ kind: "reach-dispatch" }), secret)).toBeNull();
  });
});

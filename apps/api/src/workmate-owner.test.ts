import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { workMateActorFromAssertion, workMateBotDefinition } from "./workmate-owner.js";

const secret = "workmate-rakazo-test-secret";
const ownerSource = readFileSync(fileURLToPath(new URL("./workmate-owner.ts", import.meta.url)), "utf8");

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
      adminEmail: "chris@workmateos.co.uk", tenantId: "12c07c2b-edfd-4516-8dd6-e4397e88d532", workspaceId: "22222222-2222-4222-8222-222222222222",
    }), secret);
    expect(actor).toMatchObject({
      userId: "137e2f30-ff48-46f7-a3df-881cfb099c80",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      isDeploymentOwner: true,
    });
  });

  it("rejects malformed or non-admin WorkMate assertions", () => {
    expect(workMateActorFromAssertion("bad", secret)).toBeNull();
    expect(workMateActorFromAssertion(assertion({ kind: "reach-dispatch" }), secret)).toBeNull();
  });

  it("turns a WorkMate template into a real Rakazo bot definition with native configuration controls", () => {
    expect(workMateBotDefinition({
      template_key: "workmate-cal",
      display_name: "WorkMate Cal",
      agent_definition: { role: "Scheduling and availability", tools: ["calendar-sync", "video-conferencing"] },
    })).toMatchObject({
      name: "WorkMate Cal",
      title: "Scheduling and availability",
      description: "WorkMate specialist runtime: workmate-cal",
    });
    expect(workMateBotDefinition({
      template_key: "workmate-cal",
      display_name: "WorkMate Cal",
      agent_definition: { role: "Scheduling and availability", tools: ["calendar-sync", "video-conferencing"] },
    }).instructions).toMatch(/native Rakazo skills, instructions, routines, and computer use/i);
  });

  it("does not overwrite an admin's native Rakazo settings while checking the backfill", () => {
    expect(ownerSource).not.toContain("await prisma.bot.update({");
  });
});

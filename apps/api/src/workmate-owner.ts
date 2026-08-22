import type { Actor } from "@rakazo/contracts";
import { verifyWorkMateAssertion } from "@rakazo/auth";
import { createRepos, type PrismaClient } from "@rakazo/db";

/**
 * WorkMate remains the sole identity authority. Rakazo receives a short-lived
 * assertion and projects it into its runtime scope; it never accepts a Rakazo
 * browser session in this mode.
 */
export function workMateActorFromAssertion(assertion: string | undefined, secret: string): Actor | null {
  const claims = verifyWorkMateAssertion(assertion, secret);
  if (!claims || claims.kind !== "admin-door") return null;
  if (!claims.adminUserId || !claims.adminEmail || !claims.tenantId) return null;
  return {
    userId: claims.adminUserId,
    workspaceId: claims.tenantId,
    email: claims.adminEmail,
    isDeploymentOwner: true,
  };
}

type RuntimeTemplate = { template_key: string; display_name: string };

/**
 * Materialise the WorkMate-owned template catalogue into Rakazo's real bot
 * records. `spawnKey` is the idempotent link: no synthetic catalogue is ever
 * returned to the browser, only upstream Rakazo bots and their own settings.
 */
export async function ensureWorkMateOwnerWorkspace(prisma: PrismaClient, actor: Actor) {
  const now = new Date();
  await prisma.user.upsert({
    where: { id: actor.userId },
    create: { id: actor.userId, name: actor.email.split("@")[0] || "WorkMate owner", email: actor.email, emailVerified: true },
    update: { email: actor.email },
  });
  await prisma.organization.upsert({
    where: { id: actor.workspaceId },
    create: { id: actor.workspaceId, name: "WorkMate Runtime Factory", slug: `workmate-${actor.workspaceId}`, createdAt: now },
    update: {},
  });
  await prisma.member.upsert({
    where: { organizationId_userId: { organizationId: actor.workspaceId, userId: actor.userId } },
    create: { id: `workmate-${actor.workspaceId}-${actor.userId}`, organizationId: actor.workspaceId, userId: actor.userId, role: "owner", createdAt: now },
    update: { role: "owner" },
  });
  await prisma.deploymentSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ownerUserId: actor.userId },
    update: { ownerUserId: actor.userId },
  });

  const templates = await prisma.$queryRawUnsafe<RuntimeTemplate[]>(
    "select template_key, display_name from rakazo.runtime_templates where status = 'approved' order by template_key",
  );
  const existing = await prisma.bot.findMany({
    where: { workspaceId: actor.workspaceId, userId: actor.userId, spawnKey: { startsWith: "workmate-template:" } },
    select: { spawnKey: true },
  });
  const present = new Set(existing.map((bot) => bot.spawnKey));
  const repos = createRepos(prisma);
  for (const template of templates) {
    const spawnKey = `workmate-template:${template.template_key}`;
    if (present.has(spawnKey)) continue;
    await repos.createBot(actor, {
      name: template.display_name,
      title: "WorkMate runtime",
      description: `WorkMate specialist runtime: ${template.template_key}`,
      instructions: "Configure this existing WorkMate runtime in Rakazo. WorkMate remains the authority for customer identity, model routing, approvals, and connected accounts.",
      notifyOnFinish: true,
      computerMode: "team",
      spawnKey,
    });
  }
  return actor;
}

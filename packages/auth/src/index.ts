import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { emailAllowed, parseAllowlist, signupsOpen } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { bearer, organization } from "better-auth/plugins";

export interface AuthEnv {
  secret: string;
  baseURL: string;
  webOrigin: string;
  signupsEnabled: string | undefined;
  signupAllowlist: string | undefined;
  extraOrigins?: string[];
  beforeDeleteUser?: (userId: string) => Promise<void>;
}

/**
 * The assertion WorkMate OS gives a module after its own authenticated
 * hand-off.  It is deliberately not a Rakazo session: Rakazo must validate
 * it on every request and never mint or renew an equivalent credential.
 */
export interface WorkMateAssertionClaims {
  iss: "workmate-os";
  aud: "workmate-rakazo";
  kind: "admin-door";
  jti: string;
  adminSessionId: string;
  adminUserId: string;
  adminEmail: string;
  tenantId: string;
  workspaceId: string;
  iat: number;
  exp: number;
}

const MAX_WORKMATE_ASSERTION_TTL_SECONDS = 5 * 60;

export function verifyWorkMateAssertion(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): WorkMateAssertionClaims | null {
  const [payload, signature, extra] = String(value ?? "").split(".");
  if (!payload || !signature || extra) return null;
  let claims: WorkMateAssertionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WorkMateAssertionClaims;
  } catch {
    return null;
  }
  if (!secret || !safeEqual(createHmac("sha256", secret).update(payload).digest("base64url"), signature)) {
    return null;
  }
  const nowSeconds = Math.floor(now / 1000);
  if (
    claims.iss !== "workmate-os" ||
    claims.aud !== "workmate-rakazo" ||
    claims.kind !== "admin-door" ||
    !nonEmpty(claims.jti) ||
    !nonEmpty(claims.adminSessionId) ||
    !nonEmpty(claims.adminUserId) ||
    !nonEmpty(claims.adminEmail) ||
    !nonEmpty(claims.tenantId) ||
    !nonEmpty(claims.workspaceId) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.iat > nowSeconds ||
    claims.exp <= nowSeconds ||
    claims.exp - claims.iat > MAX_WORKMATE_ASSERTION_TTL_SECONDS
  ) {
    return null;
  }
  return claims;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeEqual(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

export function createAuth(prisma: PrismaClient, env: AuthEnv) {
  return betterAuth({
    appName: "Rakazo",
    secret: env.secret,
    baseURL: env.baseURL,
    trustedOrigins: [env.webOrigin, env.baseURL, ...(env.extraOrigins ?? [])],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !signupsOpen(env.signupsEnabled),
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await env.beforeDeleteUser?.(user.id);
          const memberships = await prisma.member.findMany({
            where: { userId: user.id },
            select: {
              organizationId: true,
              organization: { select: { members: { select: { userId: true } } } },
            },
          });
          const personalOrganizationIds = memberships
            .filter(({ organization }) =>
              organization.members.every((member) => member.userId === user.id),
            )
            .map(({ organizationId }) => organizationId);

          await prisma.$transaction([
            prisma.deploymentSettings.updateMany({
              where: { ownerUserId: user.id },
              data: { ownerUserId: null },
            }),
            prisma.organization.deleteMany({
              where: { id: { in: personalOrganizationIds } },
            }),
          ]);
        },
      },
    },
    plugins: [
      bearer(),
      organization({
        allowUserToCreateOrganization: false,
        creatorRole: "owner",
      }),
    ],
    hooks: {
      before: async (ctx) => {
        const path = String((ctx as { path?: string }).path ?? "");
        if (!path.includes("sign-up")) return;
        const allowlist = parseAllowlist(env.signupAllowlist);
        const email =
          typeof ctx.body === "object" && ctx.body && "email" in ctx.body
            ? String((ctx.body as { email?: string }).email ?? "")
            : "";
        if (email && !emailAllowed(email, allowlist)) {
          throw new APIError("BAD_REQUEST", { message: "Email is not allowed to register" });
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const orgId = newId();
            await prisma.organization.create({
              data: {
                id: orgId,
                name: "Personal",
                slug: `user-${user.id.slice(0, 12)}`,
                createdAt: new Date(),
              },
            });
            await prisma.member.create({
              data: {
                id: newId(),
                organizationId: orgId,
                userId: user.id,
                role: "owner",
                createdAt: new Date(),
              },
            });
            const existing = await prisma.deploymentSettings.findUnique({
              where: { id: "default" },
            });
            if (!existing) {
              await prisma.deploymentSettings.create({
                data: { id: "default", ownerUserId: user.id },
              });
            } else if (!existing.ownerUserId) {
              await prisma.deploymentSettings.update({
                where: { id: "default" },
                data: { ownerUserId: user.id },
              });
            }
            await prisma.memoryDocument.create({
              data: {
                workspaceId: orgId,
                userId: user.id,
                scope: "user",
                path: "MEMORY.md",
                content: "# User memory\n\nAccount-wide preferences live here.\n",
              },
            });
            await prisma.notificationPreference.create({
              data: {
                workspaceId: orgId,
                userId: user.id,
              },
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const blockedAuthPaths = [
  "/organization/create",
  "/organization/invite",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
];

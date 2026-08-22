import { rm } from "node:fs/promises";
import { RPCHandler } from "@orpc/server/fetch";
import type { JobPublisher, RealtimeFanout, SandboxProvider } from "@rakazo/adapter-kit";
import {
  type ComposioProvider,
  createBackgroundJobHandlers,
  createConnectorStack,
  createJobReconciler,
  createRunExecutor,
  createRunSandbox,
  type DestinationEmulator,
  destroyBot,
  EncryptedSecretStore,
  ExpoPushProvider,
  GraphileJobPublisher,
  InMemoryJobQueue,
  InMemoryRealtimeFanout,
  isComposioEnabled,
  LocalAgentHomeStore,
  LocalArtifactStore,
  PiAgentRuntime,
  PiOAuthLogins,
  PostgresRealtimeFanout,
  pushTokenPath,
  ScriptedAgentRuntime,
} from "@rakazo/adapters";
import { blockedAuthPaths, createAuth, verifyWorkMateAssertion } from "@rakazo/auth";
import { createDb, createThreadEvents, type PrismaClient, requireMembership } from "@rakazo/db";
import { MarkdownMemoryStore } from "@rakazo/memory";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type AppEnv, loadEnv } from "./env.js";
import { createRouter } from "./router.js";
import { mountVoiceHttpRoutes } from "./voice.js";

export interface AppHandles {
  app: Hono;
  prisma: PrismaClient;
  jobs: JobPublisher;
  sandbox: SandboxProvider;
  connector: DestinationEmulator;
  composio?: ComposioProvider;
  executor: ReturnType<typeof createRunExecutor>;
  stop: () => Promise<void>;
}

export async function createApp(
  overrides: Partial<AppEnv> & {
    prisma?: PrismaClient;
    realtime?: RealtimeFanout;
    composio?: ComposioProvider;
  } = {},
): Promise<AppHandles> {
  const {
    prisma: prismaOverride,
    realtime: realtimeOverride,
    composio: composioOverride,
    ...envOverrides
  } = overrides;
  const env = { ...loadEnv(process.env), ...envOverrides };
  const created = prismaOverride
    ? { prisma: prismaOverride, pool: undefined }
    : createDb(env.databaseUrl);
  const { prisma } = created;
  created.pool?.on("error", () => undefined);
  const realtime =
    realtimeOverride ??
    (created.pool
      ? new PostgresRealtimeFanout({
          connectionString: env.realtimeDatabaseUrl,
          publisher: created.pool,
        })
      : new InMemoryRealtimeFanout());
  const events = createThreadEvents(prisma, realtime);
  await prisma.deploymentSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  const jobKind = env.wakeupDriver;
  const inMemoryJobs = jobKind === "memory" ? new InMemoryJobQueue() : undefined;
  const jobs = inMemoryJobs ?? new GraphileJobPublisher(env.databaseUrl);
  const sandbox: SandboxProvider = createRunSandbox(env.sandboxProvider, {
    supervisorUrl: env.sandboxSupervisorUrl,
    supervisorToken: env.sandboxSupervisorToken,
    e2bApiKey: env.e2bApiKey,
    daytonaApiKey: env.daytonaApiKey,
    daytonaApiUrl: env.daytonaApiUrl,
    daytonaTarget: env.daytonaTarget,
    boxApiKey: env.boxApiKey,
    boxApiUrl: env.boxApiUrl,
    dataDir: env.dataDir,
    prisma,
  });
  const secrets = new EncryptedSecretStore(env.encryptionKey);
  const oauthLogins = new PiOAuthLogins();
  const home = new LocalAgentHomeStore(env.dataDir);
  const artifacts = new LocalArtifactStore(env.dataDir);
  const memory = new MarkdownMemoryStore(prisma);
  const stack = createConnectorStack(
    env.integrationMode === "workmate" ? false : isComposioEnabled(env.composioApiKey),
    composioOverride,
  );
  const connector = stack.destination;
  await connector.start();
  void stack.composio?.warmDirectory().catch(() => undefined);
  const runtime =
    env.agentRuntime === "scripted"
      ? new ScriptedAgentRuntime()
      : new PiAgentRuntime({ workmateProduction: env.integrationMode === "workmate" });
  const notifications = new ExpoPushProvider(env.dataDir);
  const auth = env.integrationMode === "workmate" ? null : createAuth(prisma, {
    secret: env.authSecret,
    baseURL: env.authUrl,
    webOrigin: env.webOrigin,
    signupsEnabled: env.signupsEnabled,
    signupAllowlist: env.signupAllowlist,
    extraOrigins: [
      "rakazo://",
      "exp://",
      "exp://*",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://localhost:19006",
      "http://127.0.0.1:19006",
    ],
    beforeDeleteUser: async (userId) => {
      const bots = await prisma.bot.findMany({
        where: { userId },
        select: { id: true, workspaceId: true, name: true, archivedAt: true },
      });
      await Promise.all(
        bots.map((bot) =>
          destroyBot(
            { prisma, sandbox, home, jobs, artifacts, dataDir: env.dataDir },
            bot,
            {
              operationId: `account-delete:${userId}`,
              traceId: `account-delete:${userId}`,
              workspaceId: bot.workspaceId,
              userId,
              botId: bot.id,
              signal: new AbortController().signal,
            },
            { deleteMemories: true },
          ),
        ),
      );
      await rm(pushTokenPath(env.dataDir, userId), { force: true }).catch(() => undefined);
    },
  });
  const executor = createRunExecutor({
    prisma,
    runtime,
    sandbox,
    memory,
    home,
    artifacts,
    connector: stack.connector,
    listConnectedPluginSlugs: stack.composio?.listConnectedSlugs.bind(stack.composio),
    secrets: env.integrationMode === "workmate" ? [] : [env.openRouterKey ?? "", env.composioApiKey ?? ""].filter(Boolean),
    secretStore: env.integrationMode === "workmate" ? undefined : secrets,
    deploymentModelKey: env.integrationMode === "workmate" ? undefined : env.openRouterKey,
    dataDir: env.dataDir,
    notifications,
    jobs,
    events,
  });

  const jobHandlers = createBackgroundJobHandlers({
    executor,
    prisma,
    sandbox,
    home,
    jobs,
    events,
    workerId: "api",
    runtime,
    deploymentModelKey: env.integrationMode === "workmate" ? undefined : env.openRouterKey,
  });
  if (inMemoryJobs) {
    await inMemoryJobs.start(jobHandlers);
  }
  const reconciler = inMemoryJobs ? createJobReconciler({ prisma, jobs }) : undefined;
  reconciler?.start();

  const router = createRouter({
    prisma,
    events,
    jobs,
    sandbox,
    memory,
    home,
    secrets,
    oauthLogins,
    composio: stack.composio,
    artifacts,
    dataDir: env.dataDir,
    env: {
      defaultProvider: env.defaultProvider,
      defaultModel: env.defaultModel,
      openRouterKey: env.integrationMode === "workmate" ? undefined : env.openRouterKey,
      webOrigin: env.webOrigin,
      screenProxySecret: env.authSecret,
      sandboxProvider: env.sandboxProvider,
      workmateManaged: env.integrationMode === "workmate",
    },
  });
  const rpc = new RPCHandler(router);
  const app = new Hono();
  if (env.integrationMode === "workmate") {
    app.get("/api/workmate/admin/catalogue", (c) => {
      const assertion = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      const claims = verifyWorkMateAssertion(assertion, env.workmateAssertionSecret!);
      if (!claims || claims.kind !== "admin-door") return c.json({ ok: false, error: "WorkMate SaaS Admin assertion required" }, 401);
      return c.json({ ok: true, tenantId: claims.tenantId, agents: WORKMATE_SPECIALIST_CATALOGUE });
    });
  }
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return env.webOrigin;
        return isTrustedOrigin(origin, env) ? origin : "";
      },
      credentials: true,
    }),
  );
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    if (!auth) return c.json({ error: "WorkMate assertion required" }, 404);
    const path = new URL(c.req.url).pathname.replace("/api/auth", "");
    if (blockedAuthPaths.some((blocked) => path.startsWith(blocked))) {
      return c.json({ error: "Not available in version 1" }, 404);
    }
    return auth.handler(c.req.raw);
  });
  app.use("/rpc/*", async (c, next) => {
    const actor = auth
      ? await betterAuthActor(auth, prisma, c.req.raw)
      : workmateActor(c.req.raw, env.workmateAssertionSecret!);
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: { actor, signal: c.req.raw.signal },
    });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });
  mountVoiceHttpRoutes(app, { prisma, secrets }, async (c) => {
    if (!auth) return null;
    const session = await auth.api.getSession({ headers: sessionHeaders(c.req.raw) });
    if (!session?.user) return null;
    return requireMembership(prisma, session.user.id).catch(() => null);
  });
  app.get("/health", (c) =>
    c.json({
      ok: true,
      runtime: env.agentRuntime,
      sandbox: env.sandboxProvider,
      composio: Boolean(stack.composio),
      jobs: jobKind,
      realtime: realtime.describe().id,
      revision: env.gitSha ?? null,
    }),
  );

  return {
    app,
    prisma,
    jobs,
    sandbox,
    connector,
    composio: stack.composio,
    executor,
    stop: async () => {
      oauthLogins.abortAll();
      await reconciler?.stop();
      await jobs.close();
      await realtime.close();
      await connector.stop();
      await prisma.$disconnect().catch(() => undefined);
      await created.pool?.end().catch(() => undefined);
    },
  };
}

const WORKMATE_SPECIALIST_CATALOGUE = [
  ["dispatcher", "Dispatcher", "Routing"], ["innie-inbox", "Innie Inbox", "Inbox"], ["social-sal", "Social Sal", "Social"],
  ["copy-carl", "Copy Carl", "Writing"], ["chase-charlie", "Chase Charlie", "Chief of Staff"], ["doc-dot", "Doc Dot", "Documents"],
  ["audrey-accounts", "Audrey Accounts", "Finance"], ["sage-seo", "Sage SEO", "SEO"], ["studio-lite", "Studio Stella", "Studio"],
  ["studio-scriptwriter", "Studio Scriptwriter", "Scriptwriting"], ["ranky-riley", "Ranky Riley", "Rank Tracking"], ["piper-producer", "Piper Producer", "Production"],
  ["echo-voice", "Echo Voice", "Voice"], ["quinn-admin", "Quinn Admin", "Operations"], ["marky-marketing", "Marky Marketing", "Marketing"],
  ["selly-sales", "Selly Sales", "Sales"], ["bucky-builder", "Bucky Builder", "Builder"], ["graph-report", "Graph Report", "Reporting"],
  ["avery-web", "Avery Web", "Web"], ["mira-creative", "Mira Creative", "Creative"], ["muse-design", "Muse Design", "Design"],
  ["privy-personal", "Privy Personal", "Personal"], ["elanor-legal", "Elanor Legal", "Legal"], ["runtime-factory", "Runtime Factory", "SaaS Admin"],
].map(([slug, name, capability]) => ({ slug, name, capability }));

async function betterAuthActor(auth: NonNullable<ReturnType<typeof createAuth>>, prisma: PrismaClient, request: Request) {
  const session = await auth.api.getSession({ headers: sessionHeaders(request) });
  return session?.user ? requireMembership(prisma, session.user.id).catch(() => null) : null;
}

function workmateActor(request: Request, assertionSecret: string) {
  const header = request.headers.get("authorization");
  const assertion = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const claims = verifyWorkMateAssertion(assertion, assertionSecret);
  // The SaaS Admin handoff has tenant scope only. Existing Rakazo RPCs are
  // workspace-scoped, so they must remain unavailable until a separate,
  // scope-complete WorkMate contract is introduced.
  if (!claims || claims.kind !== "admin-door") return null;
  return null;
}

function isTrustedOrigin(origin: string, env: AppEnv) {
  if (!origin) return true;
  if (origin === env.webOrigin || origin === env.apiUrl || origin === env.authUrl) return true;
  if (origin.startsWith("rakazo://") || origin.startsWith("exp://")) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function sessionHeaders(request: Request) {
  const headers = new Headers(request.headers);
  const authz = headers.get("authorization");
  if (authz?.toLowerCase().startsWith("bearer ") && !headers.get("cookie")) {
    headers.set("cookie", `better-auth.session_token=${authz.slice(7).trim()}`);
  }
  return headers;
}

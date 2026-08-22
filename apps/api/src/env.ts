import { resolveAuthSecret, resolveEncryptionKey, resolveSupervisorToken } from "@rakazo/core";

export type IntegrationMode = "upstream" | "workmate";

export interface AppEnv {
  integrationMode: IntegrationMode;
  workmateAssertionSecret: string | undefined;
  workmateRakazoDatabaseUrl: string | undefined;
  databaseUrl: string;
  realtimeDatabaseUrl: string;
  authSecret: string;
  authUrl: string;
  webOrigin: string;
  apiUrl: string;
  signupsEnabled: string | undefined;
  signupAllowlist: string | undefined;
  encryptionKey: string;
  dataDir: string;
  sandboxSupervisorUrl: string;
  sandboxSupervisorToken: string;
  sandboxProvider: string;
  agentRuntime: string;
  openRouterKey: string | undefined;
  e2bApiKey: string | undefined;
  daytonaApiKey: string | undefined;
  daytonaApiUrl: string | undefined;
  daytonaTarget: string | undefined;
  boxApiKey: string | undefined;
  boxApiUrl: string | undefined;
  composioApiKey: string | undefined;
  defaultProvider: string;
  defaultModel: string;
  wakeupDriver: string;
  port: number;
  gitSha: string | undefined;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const integrationMode = integrationModeFrom(source);
  const workmateAssertionSecret = source.WORKMATE_RAKAZO_ASSERTION_SECRET;
  if (integrationMode === "workmate") assertWorkMateProductionBoundary(source, workmateAssertionSecret);
  const authSecret =
    integrationMode === "workmate"
      ? workmateAssertionSecret!
      : resolveAuthSecret(source);
  return {
    integrationMode,
    workmateAssertionSecret,
    workmateRakazoDatabaseUrl: source.WORKMATE_RAKAZO_DATABASE_URL,
    databaseUrl: required(source, "DATABASE_URL"),
    realtimeDatabaseUrl: source.REALTIME_DATABASE_URL ?? required(source, "DATABASE_URL"),
    authSecret,
    authUrl: source.BETTER_AUTH_URL ?? source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    webOrigin: source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    apiUrl: source.API_URL ?? "http://127.0.0.1:3100",
    signupsEnabled: source.SIGNUPS_ENABLED,
    signupAllowlist: source.SIGNUP_ALLOWLIST,
    encryptionKey:
      integrationMode === "workmate" ? workmateAssertionSecret! : resolveEncryptionKey(source),
    dataDir: source.DATA_DIR ?? "./data",
    sandboxSupervisorUrl: source.SANDBOX_SUPERVISOR_URL ?? "http://127.0.0.1:7091",
    sandboxSupervisorToken:
      integrationMode === "workmate"
        ? source.SANDBOX_SUPERVISOR_TOKEN ?? workmateAssertionSecret!
        : resolveSupervisorToken(source),
    sandboxProvider: source.SANDBOX_PROVIDER ?? "docker",
    agentRuntime: source.AGENT_RUNTIME ?? "pi",
    openRouterKey: source.OPENROUTER_API_KEY,
    e2bApiKey: source.E2B_API_KEY,
    daytonaApiKey: source.DAYTONA_API_KEY,
    daytonaApiUrl: source.DAYTONA_API_URL,
    daytonaTarget: source.DAYTONA_TARGET,
    boxApiKey: source.BOX_API_KEY,
    boxApiUrl: source.BOX_API_URL ?? source.BOX_BASE_URL,
    composioApiKey: source.COMPOSIO_API_KEY,
    defaultProvider: source.PI_DEFAULT_PROVIDER ?? "openrouter",
    defaultModel: source.PI_DEFAULT_MODEL ?? "deepseek/deepseek-v4-flash-0731",
    wakeupDriver: source.WAKEUP_DRIVER ?? "graphile",
    port: Number(source.API_PORT ?? 3100),
    gitSha: optional(source.GIT_SHA) ?? optional(source.RAKAZO_GIT_SHA),
  };
}

function integrationModeFrom(source: NodeJS.ProcessEnv): IntegrationMode {
  const value = source.RAKAZO_INTEGRATION_MODE ?? "upstream";
  if (value === "upstream" || value === "workmate") return value;
  throw new Error("RAKAZO_INTEGRATION_MODE must be upstream or workmate");
}

function assertWorkMateProductionBoundary(source: NodeJS.ProcessEnv, assertionSecret: string | undefined): void {
  if (source.NODE_ENV !== "production") {
    throw new Error("RAKAZO_INTEGRATION_MODE=workmate is production-only");
  }
  if (!assertionSecret || assertionSecret.length < 12) throw new Error("WORKMATE_RAKAZO_ASSERTION_SECRET is required in WorkMate production mode");
  if (!source.WORKMATE_RAKAZO_DATABASE_URL) throw new Error("WORKMATE_RAKAZO_DATABASE_URL is required in WorkMate production mode");
  const forbidden = [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "OPENROUTER_API_KEY",
    "COMPOSIO_API_KEY",
    "PI_DEFAULT_PROVIDER",
    "PI_DEFAULT_MODEL",
  ].filter((key) => source[key]?.trim());
  if (forbidden.length) {
    throw new Error(`WorkMate production mode rejects independent authority or provider credentials: ${forbidden.join(", ")}`);
  }
}


function required(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

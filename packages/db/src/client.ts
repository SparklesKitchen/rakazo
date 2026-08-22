import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type Db = PrismaClient;

export function createDb(connectionString: string): { prisma: PrismaClient; pool: Pool } {
  // Rakazo's upstream Prisma models are isolated from WorkMate's private
  // authority schema.  The adapter uses pg directly, so set the server-side
  // search path here rather than relying on Prisma's URL-only schema hint.
  const pool = new Pool({ connectionString, options: "-c search_path=rakazo_internal" });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

export type { Pool } from "pg";
export * from "./generated/prisma/client.js";
export { Prisma, PrismaClient } from "./generated/prisma/client.js";

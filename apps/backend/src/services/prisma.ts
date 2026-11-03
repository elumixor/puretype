export * from "generated:prisma";

import { PrismaClient } from "generated:prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql/web";
import { env } from "env";

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient | undefined };

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaLibSql({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!env.production) globalForPrisma.prisma = prisma;

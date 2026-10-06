import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const url = process.env.DATABASE_URL ?? "";
  // The local `prisma dev` database (PGlite) drops connections when several are used at once.
  const isLocal = /@(localhost|127\.0\.0\.1):/.test(url);
  const adapter = new PrismaPg({ connectionString: url, ...(isLocal ? { max: 1 } : {}) });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

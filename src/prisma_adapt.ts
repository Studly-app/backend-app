import { PrismaClient } from "./generated/prisma";
import { PrismaD1 } from "@prisma/adapter-d1";

export default function Prisma(env: CloudflareBindings) {
  console.log(env.DB);
  const adapter = new PrismaD1(env.DB);
  const prisma = new PrismaClient({ adapter });

  return prisma;
}

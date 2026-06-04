// One-off account recovery helper (dev). Usage:
//   node scripts/admin-cli.mjs list
//   node scripts/admin-cli.mjs reset <email> <newPassword>
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(here, "..", ".env") });

const prisma = new PrismaClient();
const cost = Number(process.env.BCRYPT_COST ?? "12");

async function main() {
  const [cmd, email, newPassword] = process.argv.slice(2);

  if (cmd === "list") {
    const users = await prisma.user.findMany({
      select: { email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(`USER_COUNT: ${users.length}`);
    for (const u of users) {
      console.log(`- ${u.email} | ${u.role} | ${u.name ?? "(no name)"}`);
    }
    return;
  }

  if (cmd === "reset") {
    if (!email || !newPassword) {
      throw new Error('Usage: node scripts/admin-cli.mjs reset <email> "<newPassword>"');
    }
    if (newPassword.length < 10) {
      throw new Error("Password must be at least 10 characters.");
    }
    const passwordHash = await bcrypt.hash(newPassword, cost);
    const updated = await prisma.user.update({
      where: { email: email.trim().toLowerCase() },
      data: { passwordHash },
      select: { email: true, role: true },
    });
    console.log(`RESET_OK: ${updated.email} (${updated.role})`);
    return;
  }

  throw new Error('Unknown command. Use "list" or "reset <email> <newPassword>".');
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { prisma } from "services/prisma";
import { searchDatabases } from "services/notion";

const accounts = await prisma.notionAccount.findMany();
console.log("accounts:", accounts.map((a) => ({ id: a.id, ws: (a as any).workspaceName })));
for (const a of accounts) {
  const dbs = await searchDatabases(a.accessToken);
  console.log(`account ${a.id} -> ${dbs.length} databases`);
  for (const d of dbs) console.log("  ", d.title, d.id);
}
process.exit(0);

import { randomBytes } from "node:crypto";
import { prisma } from "services/prisma";

// Short-lived code the user generates in-app and types into the bot. The code
// proves the Telegram sender controls this account before we bind them.
const CODE_TTL_MS = 1000 * 60 * 10; // 10 minutes
// Crockford-ish alphabet: no 0/O/1/I/L to keep codes easy to read and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function genCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Create (and replace any prior) link code for a user. */
export async function createLinkCode(userId: string) {
  // Only the latest code should be valid — drop earlier ones.
  await prisma.telegramLinkCode.deleteMany({ where: { userId } });
  const code = genCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.telegramLinkCode.create({ data: { code, userId, expiresAt } });
  return { code, expiresAt };
}

export type RedeemResult =
  | { ok: true; email: string | null }
  | { ok: false; reason: "not_found" | "expired" };

/** Bind a Telegram account to the user behind a link code. */
export async function redeemLinkCode(
  code: string,
  tg: { telegramUserId: string; chatId: string; username: string | null },
): Promise<RedeemResult> {
  const row = await prisma.telegramLinkCode.findUnique({ where: { code }, include: { user: true } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.telegramLinkCode.delete({ where: { code } }).catch(() => {});
    return { ok: false, reason: "expired" };
  }

  await prisma.telegramLink.upsert({
    where: { telegramUserId: tg.telegramUserId },
    create: { telegramUserId: tg.telegramUserId, userId: row.userId, chatId: tg.chatId, username: tg.username },
    update: { userId: row.userId, chatId: tg.chatId, username: tg.username },
  });
  await prisma.telegramLinkCode.delete({ where: { code } }).catch(() => {});
  return { ok: true, email: row.user.email };
}

/** Resolve the app user a Telegram account is linked to, if any. */
export async function resolveLinkedUserId(telegramUserId: string): Promise<string | null> {
  const link = await prisma.telegramLink.findUnique({ where: { telegramUserId } });
  return link?.userId ?? null;
}

/** Remove a Telegram link. Returns true if one existed. */
export async function unlinkTelegram(telegramUserId: string): Promise<boolean> {
  const res = await prisma.telegramLink.deleteMany({ where: { telegramUserId } });
  return res.count > 0;
}

import { env } from "env";
import { prisma } from "services/prisma";
import { redeemLinkCode, resolveLinkedUserId, unlinkTelegram } from "services/telegram-link";

const API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId: number | string, text: string, options?: { reply_markup?: unknown }) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", ...options }),
  });
}

// Bot username is needed to build the t.me/<bot>?start=<code> deep link the app
// shows. It never changes for a token, so fetch once and cache.
let cachedUsername: string | null | undefined;
export async function getBotUsername(): Promise<string | null> {
  if (cachedUsername !== undefined) return cachedUsername;
  try {
    const res = await fetch(`${API}/getMe`);
    const data = (await res.json()) as { result?: { username?: string } };
    cachedUsername = data.result?.username ?? null;
  } catch {
    cachedUsername = null;
  }
  return cachedUsername;
}

async function getToday(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { bucket: "today", userId, deletedAt: null },
    orderBy: { order: "asc" },
  });
  return { tasks };
}

function formatTodayTasks(day: { tasks: { text: string; completed: boolean }[] }) {
  if (!day.tasks.length) return `*Today*\n_No tasks yet._`;
  const lines = day.tasks.map((t, i) => `${t.completed ? "~" : ""}${i + 1}. ${t.text}${t.completed ? "~" : ""}`);
  return `*Today*\n${lines.join("\n")}`;
}

async function addToday(userId: string, text: string) {
  const maxOrder = await prisma.task.aggregate({
    where: { bucket: "today", userId },
    _max: { order: true },
  });
  await prisma.task.create({
    data: {
      userId,
      text,
      bucket: "today",
      scheduledAt: new Date(),
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

const HELP =
  "*PureType Bot*\n\n" +
  "/today - Show today's tasks\n" +
  "/add <task> - Add a task\n" +
  "/done <number> - Complete a task\n" +
  "/undo <number> - Uncomplete a task\n" +
  "/delete <number> - Delete a task\n" +
  "/unlink - Disconnect this Telegram account\n";

const NEEDS_LINK =
  "👋 *PureType Bot*\n\n" +
  "This chat isn't linked to your account yet.\n\n" +
  "Open PureType → tap your avatar → *Link Telegram*, then send me the code " +
  "(or just tap the button there).";

// A task command that addresses a task by its position in today's list.
async function byNumber(
  userId: string,
  chatId: number,
  raw: string,
  apply: (taskId: string) => Promise<unknown>,
) {
  const num = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(num)) return sendMessage(chatId, "Usage: <command> <task number>");
  const day = await getToday(userId);
  const task = day.tasks[num - 1];
  if (!task) return sendMessage(chatId, `Task #${num} not found.`);
  await apply(task.id);
  return sendMessage(chatId, formatTodayTasks(await getToday(userId)));
}

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const message = update.message as
    | { chat: { id: number }; from?: { id: number; username?: string }; text?: string }
    | undefined;
  if (!message?.text) return;

  const chatId = message.chat.id;
  // from.id identifies the human; fall back to chatId for non-standard updates.
  const telegramUserId = String(message.from?.id ?? chatId);
  const username = message.from?.username ?? null;
  const text = message.text.trim();

  // Linking: `/start <code>` (deep link) or `/link <code>` (manual).
  const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  const link = text.match(/^\/link(?:@\w+)?(?:\s+(\S+))?$/);
  if (start || link) {
    const code = (start?.[1] ?? link?.[1] ?? "").trim().toUpperCase();
    if (code) {
      const result = await redeemLinkCode(code, { telegramUserId, chatId: String(chatId), username });
      if (result.ok) {
        return sendMessage(
          chatId,
          `✅ Linked to \`${result.email ?? "your account"}\`.\n\nSend /today to see your tasks.`,
        );
      }
      const why = result.reason === "expired" ? "That code has expired." : "That code isn't valid.";
      return sendMessage(chatId, `${why}\n\nGet a fresh one from PureType → avatar → *Link Telegram*.`);
    }
    // Bare /start — greet based on whether they're already linked.
    const linked = await resolveLinkedUserId(telegramUserId);
    return sendMessage(chatId, linked ? HELP : NEEDS_LINK);
  }

  // Every other command requires a linked account.
  const userId = await resolveLinkedUserId(telegramUserId);
  if (!userId) return sendMessage(chatId, NEEDS_LINK);

  if (text === "/help") return sendMessage(chatId, HELP);

  if (text === "/unlink") {
    await unlinkTelegram(telegramUserId);
    return sendMessage(chatId, "Disconnected. Your tasks are untouched — link again any time from the app.");
  }

  if (text === "/today") return sendMessage(chatId, formatTodayTasks(await getToday(userId)));

  if (text.startsWith("/add ")) {
    const taskText = text.slice(5).trim();
    if (!taskText) return sendMessage(chatId, "Usage: /add <task text>");
    await addToday(userId, taskText);
    return sendMessage(chatId, formatTodayTasks(await getToday(userId)));
  }

  if (text.startsWith("/done "))
    return byNumber(userId, chatId, text.slice(6), (id) =>
      prisma.task.update({ where: { id }, data: { completed: true, completedAt: new Date() } }),
    );

  if (text.startsWith("/undo "))
    return byNumber(userId, chatId, text.slice(6), (id) =>
      prisma.task.update({ where: { id }, data: { completed: false, completedAt: null } }),
    );

  if (text.startsWith("/delete "))
    return byNumber(userId, chatId, text.slice(8), (id) =>
      prisma.task.update({ where: { id }, data: { deletedAt: new Date() } }),
    );

  // Default: treat free text as a new task.
  await addToday(userId, text);
  return sendMessage(chatId, `Added!\n\n${formatTodayTasks(await getToday(userId))}`);
}

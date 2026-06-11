import { createError } from "h3";
import { getBotUsername } from "services/telegram";
import { createLinkCode } from "services/telegram-link";
import { handler } from "utils";

// Generate a one-time code the signed-in user types into the Telegram bot to
// link that chat to their account. Anonymous (email-less) users can't link —
// there'd be nothing durable to bind to.
export default handler(async ({ user }) => {
  if (!user) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  if (!user.email) throw createError({ statusCode: 400, statusMessage: "Sign in before linking Telegram" });

  const { code, expiresAt } = await createLinkCode(user.id);
  const botUsername = await getBotUsername();

  return {
    code,
    expiresAt,
    botUsername,
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
  };
});

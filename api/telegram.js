import { supabaseRequest } from "../lib/supabase.js";

function senderName(message) {
  return [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || message.from?.username || "Telegram member";
}

function singaporeDay(sentAt) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(sentAt);
  const start = new Date(`${key}T00:00:00+08:00`);
  return { key, start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "method_not_allowed" });
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || request.headers["x-telegram-bot-api-secret-token"] !== expectedSecret) {
    return response.status(401).json({ ok: false, error: "invalid_webhook_secret" });
  }

  const update = request.body || {};
  const message = update.message || update.edited_message;
  if (!message?.chat?.id) return response.status(200).json({ ok: true, ignored: true });

  const sentAt = new Date((message.date || Math.floor(Date.now() / 1000)) * 1000);
  const day = singaporeDay(sentAt);
  const sessions = await supabaseRequest(
    `project_sessions?telegram_chat_id=eq.${message.chat.id}&status=eq.active&started_at=gte.${encodeURIComponent(day.start)}&started_at=lt.${encodeURIComponent(day.end)}&select=id,participants&order=started_at.desc&limit=1`
  );
  let session = sessions[0];
  if (!session) {
    [session] = await supabaseRequest("project_sessions", {
      method: "POST", prefer: "return=representation", body: JSON.stringify({
        telegram_chat_id: message.chat.id,
        title: `${day.key} daily project update`,
        summary: "Collecting today’s Telegram conversation for the 11:00 PM SGT consolidation.",
        participants: [senderName(message)],
        started_at: sentAt.toISOString(),
        last_message_at: sentAt.toISOString()
      })
    });
  }

  const [saved] = await supabaseRequest("telegram_updates?on_conflict=telegram_update_id", {
    method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body: JSON.stringify({
      session_id: session.id,
      telegram_update_id: update.update_id,
      telegram_chat_id: message.chat.id,
      telegram_message_id: message.message_id,
      sender_name: senderName(message),
      sent_at: sentAt.toISOString(),
      raw_message: message
    })
  });
  if (!saved) return response.status(200).json({ ok: true, duplicate: true, notified: false });

  const participants = [...new Set([...(session.participants || []), senderName(message)])];
  await supabaseRequest(`project_sessions?id=eq.${session.id}`, {
    method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ participants, last_message_at: sentAt.toISOString() })
  });
  console.log("[plinth-telegram] queued for daily consolidation", { sessionId: session.id, singaporeDay: day.key });
  return response.status(200).json({ ok: true, queued: true, consolidatesAt: "23:00 Asia/Singapore", notified: false });
}

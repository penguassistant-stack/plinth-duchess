import { aiAcknowledgement, interpretTelegramMessage } from "../lib/ai.js";
import { combineSessionMessages } from "../lib/session.js";
import { supabaseRequest } from "../lib/supabase.js";

function summary(records) {
  const labels = { decision: "decision", action: "action", issue: "blocker", question: "question", evidence: "progress update" };
  const counts = records.reduce((all, record) => (all[record.kind] = (all[record.kind] || 0) + 1, all), {});
  return Object.entries(counts).map(([kind, count]) => `${count} ${labels[kind]}${count === 1 ? "" : "s"}`).join(" · ") || "No new project-state changes";
}

async function reply(chatId, messageId, text) {
  if (!text || !process.env.TELEGRAM_BOT_TOKEN) return;
  const result = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, reply_to_message_id: messageId, text })
  });
  if (!result.ok) throw new Error(`Telegram daily summary failed with ${result.status}`);
}

async function consolidate(session, options = {}) {
  const updates = await supabaseRequest(`telegram_updates?session_id=eq.${session.id}&select=id,telegram_chat_id,telegram_message_id,sender_name,sent_at,raw_message&order=sent_at.asc&limit=500`);
  const pending = updates.filter(update => !update.raw_message?.plinth_daily_batch && !update.raw_message?.plinth_ai);
  if (!pending.length) {
    await supabaseRequest(`project_sessions?id=eq.${session.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ status: "closed", ended_at: new Date().toISOString() }) });
    return { sessionId: session.id, skipped: true };
  }
  const transcript = combineSessionMessages(pending);
  const last = pending[pending.length - 1];
  const recent = await supabaseRequest("project_records?select=id,session_id,kind,text,room,area,status,actor,source_sent_at&order=source_sent_at.desc&limit=160");
  const interpretation = await interpretTelegramMessage({ chat: { id: session.telegram_chat_id }, text: transcript }, recent, { allowStandaloneResolutions: true });

  await Promise.all(interpretation.changes.filter(change => change.applied && change.targetRecordId).map(change =>
    supabaseRequest(`project_records?id=eq.${encodeURIComponent(change.targetRecordId)}`, {
      method: "PATCH", prefer: "return=minimal", body: JSON.stringify({
        status: change.operation === "dismiss" ? "dismissed" : change.operation === "resolve" ? "completed" : change.status,
        ...(change.operation === "update" ? { text: change.text, room: change.room, area: change.area, actor: "Daily Telegram consolidation", source_sent_at: last.sent_at } : {})
      })
    })
  ));
  const inserts = interpretation.changes.filter(change => !change.applied || !change.targetRecordId);
  if (inserts.length) await supabaseRequest("project_records", {
    method: "POST", prefer: "return=minimal", body: JSON.stringify(inserts.map(change => ({
      session_id: session.id, update_id: last.id, kind: change.kind, text: change.text, room: change.room, area: change.area,
      status: change.status, actor: "Daily Telegram consolidation", source_sent_at: last.sent_at
    })))
  });

  await Promise.all(pending.map(update => supabaseRequest(`telegram_updates?id=eq.${update.id}`, {
    method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ raw_message: {
      ...update.raw_message,
      plinth_daily_batch: session.id,
      ...(update.id === last.id ? { plinth_ai: { ...interpretation, changes: interpretation.changes } } : {})
    } })
  })));
  await supabaseRequest(`project_sessions?id=eq.${session.id}`, {
    method: "PATCH", prefer: "return=minimal", body: JSON.stringify({
      title: interpretation.title || "Daily project update", summary: summary(interpretation.changes), status: "closed", ended_at: new Date().toISOString()
    })
  });
  if (options.notifyTelegram) await reply(session.telegram_chat_id, last.telegram_message_id, aiAcknowledgement(interpretation, { force: true }));
  return { sessionId: session.id, messages: pending.length, changes: interpretation.changes.length };
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) return response.status(405).json({ ok: false, error: "method_not_allowed" });
  const scheduled = request.method === "GET";
  const cronAuthorized = scheduled && process.env.CRON_SECRET && request.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  const ownerAuthorized = !scheduled && process.env.PLINTH_OWNER_PIN && request.headers["x-plinth-owner-pin"] === process.env.PLINTH_OWNER_PIN;
  if (!cronAuthorized && !ownerAuthorized) return response.status(401).json({ ok: false, error: scheduled ? "invalid_cron_secret" : "invalid_owner_pin" });
  try {
    const earliest = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const sessions = await supabaseRequest(`project_sessions?status=eq.active&started_at=gte.${encodeURIComponent(earliest)}&select=id,telegram_chat_id,last_message_at&order=started_at.asc&limit=20`);
    const results = [];
    for (const session of sessions) results.push(await consolidate(session, { notifyTelegram: scheduled }));
    console.log("[plinth-daily] completed", { sessions: results.length, trigger: scheduled ? "schedule" : "owner" });
    return response.status(200).json({ ok: true, results });
  } catch (error) {
    console.error("[plinth-daily] failed", error);
    return response.status(500).json({ ok: false, error: "daily_consolidation_failed" });
  }
}

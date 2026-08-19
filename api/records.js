import { supabaseRequest } from "../lib/supabase.js";

const allowedStatuses = new Set(["open", "blocked", "confirmed", "completed", "dismissed"]);
const normalized = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "method_not_allowed" });
  if (!process.env.PLINTH_OWNER_PIN || request.headers["x-plinth-owner-pin"] !== process.env.PLINTH_OWNER_PIN) {
    return response.status(401).json({ ok: false, error: "invalid_owner_pin" });
  }
  const { recordId, status } = request.body || {};
  if (!recordId || !allowedStatuses.has(status)) return response.status(400).json({ ok: false, error: "invalid_record_update" });
  const records = await supabaseRequest(`project_records?id=eq.${encodeURIComponent(recordId)}&select=id,update_id,text&limit=1`);
  const record = records[0];
  if (!record) return response.status(404).json({ ok: false, error: "record_not_found" });
  await supabaseRequest(`project_records?id=eq.${record.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ status }) });

  if (record.update_id) {
    const updates = await supabaseRequest(`telegram_updates?id=eq.${encodeURIComponent(record.update_id)}&select=id,raw_message&limit=1`);
    const update = updates[0];
    const changes = update?.raw_message?.plinth_ai?.changes;
    if (update && Array.isArray(changes)) {
      const index = changes.findIndex(change => normalized(change.text) === normalized(record.text));
      if (index >= 0) {
        changes[index] = { ...changes[index], status, operation: status === "completed" ? "resolve" : status === "dismissed" ? "dismiss" : changes[index].operation, applied: true, requiresReview: false, rationale: `Status set to ${status} by Mel.` };
        await supabaseRequest(`telegram_updates?id=eq.${update.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ raw_message: { ...update.raw_message, plinth_ai: { ...update.raw_message.plinth_ai, changes } } }) });
      }
    }
  }
  return response.status(200).json({ ok: true, recordId, status });
}

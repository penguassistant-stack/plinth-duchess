import { supabaseRequest } from "../lib/supabase.js";

function normalize(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function suppliedPin(request) {
  return String(request.headers["x-plinth-owner-pin"] || "");
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "method_not_allowed" });

  const expectedPin = process.env.PLINTH_OWNER_PIN;
  if (!expectedPin) return response.status(503).json({ ok: false, error: "owner_pin_not_configured" });
  if (suppliedPin(request) !== expectedPin) return response.status(401).json({ ok: false, error: "invalid_owner_pin" });

  const { recordId, action, correction } = request.body || {};
  if (!recordId || !["confirm", "correct", "dismiss"].includes(action)) {
    return response.status(400).json({ ok: false, error: "invalid_review_action" });
  }
  if (action === "correct" && !String(correction || "").trim()) {
    return response.status(400).json({ ok: false, error: "correction_required" });
  }

  const records = await supabaseRequest(`project_records?id=eq.${encodeURIComponent(recordId)}&select=id,update_id,text,status&limit=1`);
  const record = records[0];
  if (!record) return response.status(404).json({ ok: false, error: "record_not_found" });

  const updates = record.update_id
    ? await supabaseRequest(`telegram_updates?id=eq.${encodeURIComponent(record.update_id)}&select=id,raw_message&limit=1`)
    : [];
  const update = updates[0];
  const rawMessage = update?.raw_message || {};
  const changes = Array.isArray(rawMessage.plinth_ai?.changes) ? rawMessage.plinth_ai.changes : [];
  const changeIndex = changes.findIndex(change => normalize(change.text) === normalize(record.text));
  const reviewedText = action === "correct" ? String(correction).trim() : record.text;
  const nextStatus = action === "dismiss" ? "dismissed" : record.status;

  await supabaseRequest(`project_records?id=eq.${encodeURIComponent(record.id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ text: reviewedText, status: nextStatus })
  });

  if (update && changeIndex >= 0) {
    changes[changeIndex] = {
      ...changes[changeIndex],
      text: reviewedText,
      operation: action === "dismiss" ? "dismiss" : changes[changeIndex].operation,
      status: nextStatus,
      confidence: 1,
      requiresReview: false,
      applied: true,
      rationale: action === "confirm"
        ? "Confirmed by Mel in owner review."
        : action === "correct"
          ? "Corrected and confirmed by Mel in owner review."
          : "Dismissed by Mel in owner review."
    };
    await supabaseRequest(`telegram_updates?id=eq.${encodeURIComponent(update.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ raw_message: { ...rawMessage, plinth_ai: { ...rawMessage.plinth_ai, changes } } })
    });
  }

  console.log("[plinth-review] completed", { recordId, action });
  return response.status(200).json({ ok: true, recordId, action });
}

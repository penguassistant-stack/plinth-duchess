import { supabaseConfigured, supabaseRequest } from "../lib/supabase.js";
import { classifyMessage, inferRecordContext } from "../lib/message.js";

const recordLabels = { decision: "decision", action: "action", issue: "blocker", question: "question", evidence: "update" };
const noiseRecord = record => /^(?:add:?|\d+[.)]?)$/i.test(String(record.text).trim());
function cleanSession(records) {
  return records.filter(record => !noiseRecord(record));
}
function sessionSummary(records) {
  const counts = records.reduce((result, record) => (result[record.kind] = (result[record.kind] || 0) + 1, result), {});
  return Object.entries(counts).map(([kind, count]) => `${count} ${recordLabels[kind]}${count === 1 ? "" : "s"}`).join(" · ");
}
function sessionTitle(records) {
  if (records.length >= 5) return "Project status + next actions";
  const first = records[0]?.text || "Project update";
  return first.length > 72 ? `${first.slice(0, 69)}…` : first;
}
const ignoredTopicWords = new Set(["about", "after", "again", "already", "been", "being", "clear", "cleared", "complete", "completed", "done", "every", "from", "have", "longer", "make", "needed", "required", "resolved", "should", "that", "there", "this", "update", "with"]);
const topicTokens = text => new Set((String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter(token => (token.length > 3 || token === "47") && !ignoredTopicWords.has(token)));
function topicScore(left, right) {
  const a = topicTokens(left), b = topicTokens(right);
  if (!a.size || !b.size) return 0;
  return [...a].filter(term => b.has(term)).length / Math.min(a.size, b.size);
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!supabaseConfigured()) {
    return response.status(503).json({ ok: false, error: "database_not_configured" });
  }

  try {
    const sessions = await supabaseRequest(
      `project_sessions?select=id,title,summary,participants,started_at,ended_at,last_message_at,project_records(id,update_id,kind,text,room,area,status,actor,source_sent_at)&status=eq.closed&order=started_at.desc&limit=30`
    );
    const records = sessions.flatMap(session => session.project_records || []).sort((a, b) => new Date(a.source_sent_at) - new Date(b.source_sent_at));
    const updateIds = [...new Set(records.map(record => record.update_id).filter(Boolean))];
    const updates = updateIds.length ? await supabaseRequest(`telegram_updates?select=id,raw_message&id=in.(${updateIds.map(encodeURIComponent).join(",")})`) : [];
    const aiByUpdate = new Map(updates.map(update => [update.id, update.raw_message?.plinth_ai || null]));
    records.forEach(record => {
      const ai = aiByUpdate.get(record.update_id);
      const change = ai?.changes?.find(item => String(item.text).trim().toLowerCase() === String(record.text).trim().toLowerCase());
      if (!change) return;
      Object.assign(record, {
        operation: change.operation,
        entity_type: change.entityType,
        target_record_id: change.targetRecordId,
        owner: change.owner,
        vendor: change.vendor,
        item_name: change.itemName,
        due_at: change.dueDate,
        confidence: change.confidence,
        requires_review: change.requiresReview,
        applied: change.applied,
        rationale: change.rationale,
        ai_generated: ai.mode === "ai",
        ai_model: ai.model
      });
    });
    const changed = new Map();
    records.forEach(record => {
      if (noiseRecord(record)) return;
      if (record.ai_generated) return;
      const context = inferRecordContext(record.text);
      const classification = classifyMessage({ text: record.text });
      const update = {
        kind: classification.kind,
        text: classification.text,
        room: record.room || context.room,
        area: context.area,
        status: context.status !== "open" ? context.status : record.status,
      };
      if (update.kind !== record.kind || update.text !== record.text || update.room !== record.room || update.area !== record.area || update.status !== record.status) changed.set(record.id, update);
      Object.assign(record, update);
    });

    records.filter(record => record.applied !== false && ["completed", "dismissed"].includes(record.status)).forEach(resolution => {
      records.filter(record => new Date(record.source_sent_at) < new Date(resolution.source_sent_at) && ["open", "blocked", "confirmed"].includes(record.status)).forEach(record => {
        if (topicScore(record.text, resolution.text) >= 0.55) {
          record.status = resolution.status;
          changed.set(record.id, { kind: record.kind, text: record.text, room: record.room, area: record.area, status: resolution.status });
        }
      });
    });

    await Promise.all([...changed.entries()].map(async ([id, update]) => {
      await supabaseRequest(`project_records?id=eq.${id}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify(update),
      });
    }));
    const canonical = [];
    [...records].sort((a, b) => new Date(b.source_sent_at) - new Date(a.source_sent_at)).forEach(record => {
      const duplicate = canonical.some(current => current.kind === record.kind && current.area === record.area && topicScore(current.text, record.text) >= 0.9);
      if (!duplicate) canonical.push(record);
    });
    const canonicalIds = new Set(canonical.map(record => record.id));
    await Promise.all(sessions.map(async session => {
      session.project_records = cleanSession(session.project_records || []).filter(record => canonicalIds.has(record.id));
      const title = sessionTitle(session.project_records);
      const summary = sessionSummary(session.project_records);
      if (title !== session.title || summary !== session.summary) {
        session.title = title;
        session.summary = summary;
        await supabaseRequest(`project_sessions?id=eq.${session.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ title, summary }) });
      }
    }));
    const seen = new Set();
    const cleanSessions = sessions.filter(session => {
      if (!session.project_records.length) return false;
      const signature = session.project_records.map(record => record.text.toLowerCase()).sort().join("|");
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
    response.setHeader("cache-control", "public, max-age=0, s-maxage=15, stale-while-revalidate=30");
    return response.status(200).json({ ok: true, sessions: cleanSessions });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ ok: false, error: "database_read_failed" });
  }
}

import { generateText, jsonSchema, Output } from "ai";
import { classifyRecords } from "./message.js";
import { compactProjectMemory } from "./project-memory.js";
import { compactProjectSchedule } from "./project-schedule.js";

export const AI_MODEL = "anthropic/claude-sonnet-4.6";

const rooms = ["Whole unit", "Living room", "Dining room", "Kitchen", "Wine lounge", "Master bedroom", "Bedroom 2 + bath", "Study room", "Helper’s room + WC", "Airwell / courtyard", "Basement / parking"];
const areas = ["Design & approvals", "Site preparation & protection", "Demolition & structural works", "Carpentry & built-ins", "Electrical & lighting", "Plumbing & sanitary", "Air-conditioning & ventilation", "Flooring, walls & finishes", "Doors, windows & glazing", "Painting", "External works & roofing", "Furniture, appliances & purchases", "Deliveries & installation", "Defects & handover"];

const ignoredMatchWords = new Set(["about", "after", "again", "already", "been", "being", "clear", "cleared", "complete", "completed", "done", "every", "from", "have", "longer", "make", "needed", "required", "resolved", "should", "that", "there", "this", "update", "with"]);
function topicTokens(value) {
  return new Set((String(value).toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => (word.length > 3 || word === "47") && !ignoredMatchWords.has(word)));
}
function topicScore(left, right) {
  const a = topicTokens(left);
  const b = topicTokens(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter(word => b.has(word)).length;
  return overlap / Math.min(a.size, b.size);
}
function findUniqueTarget(change, records) {
  const candidates = records
    .filter(record => ["open", "blocked", "confirmed"].includes(record.status))
    .map(record => ({ record, score: topicScore(change.text, record.text) }))
    .filter(candidate => candidate.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  if (!candidates.length || (candidates[1] && candidates[0].score - candidates[1].score < 0.15)) return null;
  return candidates[0].record.id;
}

const extractionSchema = jsonSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    clarification: { anyOf: [{ type: "string" }, { type: "null" }] },
    changes: {
      type: "array",
      minItems: 0,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["decision", "action", "issue", "question", "evidence"] },
          operation: { type: "string", enum: ["create", "update", "resolve", "dismiss"] },
          entityType: { type: "string", enum: ["action", "blocker", "decision", "delivery", "item", "specification", "milestone", "evidence", "question"] },
          text: { type: "string" },
          targetRecordId: { anyOf: [{ type: "string" }, { type: "null" }] },
          room: { anyOf: [{ type: "string", enum: rooms }, { type: "null" }] },
          area: { type: "string", enum: areas },
          owner: { anyOf: [{ type: "string" }, { type: "null" }] },
          vendor: { anyOf: [{ type: "string" }, { type: "null" }] },
          itemName: { anyOf: [{ type: "string" }, { type: "null" }] },
          dueDate: { anyOf: [{ type: "string" }, { type: "null" }] },
          status: { type: "string", enum: ["open", "confirmed", "blocked", "completed", "dismissed"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          requiresReview: { type: "boolean" },
          rationale: { type: "string" }
        },
        required: ["kind", "operation", "entityType", "text", "targetRecordId", "room", "area", "owner", "vendor", "itemName", "dueDate", "status", "confidence", "requiresReview", "rationale"]
      }
    }
  },
  required: ["title", "summary", "clarification", "changes"]
});

function fallbackInterpretation(message, error) {
  const changes = classifyRecords(message).map(record => ({
    ...record,
    operation: record.status === "completed" ? "resolve" : record.status === "dismissed" ? "dismiss" : "create",
    entityType: record.kind === "issue" ? "blocker" : record.kind === "evidence" ? "evidence" : record.kind,
    targetRecordId: null,
    owner: null,
    vendor: null,
    itemName: null,
    dueDate: null,
    confidence: 0.45,
    requiresReview: true,
    rationale: "Rule-based fallback; AI interpretation was unavailable.",
    applied: false
  }));
  return {
    title: changes[0]?.text || "Project update",
    summary: `${changes.length} update${changes.length === 1 ? "" : "s"} captured for review`,
    clarification: changes.length ? "Please review this interpretation in Mel Review." : null,
    changes,
    model: null,
    mode: "fallback",
    error: error ? String(error.message || error).slice(0, 240) : null
  };
}

export async function interpretTelegramMessage(message, recentRecords = [], options = {}) {
  const sourceText = (message.text || message.caption || "").trim();
  if (!sourceText && (message.photo?.length || message.document)) return fallbackInterpretation(message);
  const context = recentRecords.slice(0, 80).map(record => ({
    id: record.id,
    kind: record.kind,
    text: record.text,
    room: record.room,
    area: record.area,
    status: record.status,
    actor: record.actor,
    sentAt: record.source_sent_at
  }));

  try {
    const result = await generateText({
      model: AI_MODEL,
      output: Output.object({ schema: extractionSchema }),
      system: `You are Plinth, the contextual project intelligence for a residential renovation. Read the entire conversation session as a coherent exchange, then reconcile it into atomic, MECE project changes.

Rules:
- Resolve pronouns, shorthand, replies and phrases such as “this one”, “same one”, “he will do it” and “done already” from the supplied session and project memory.
- Distinguish Mel, Mom and Xin Hao. Mom is a co-homeowner, not a casual participant.
- A preference is not a confirmed decision. Homeowner agreement, an explicit choice, or a commitment makes it a decision.
- Interpret the newest contribution in light of the full active session. Do not repeat changes already represented by recent canonical records.
- Keep source meaning. Never invent a vendor, room, owner, price, date, decision or completion.
- Return an empty changes array for greetings, acknowledgements, reactions, casual conversation, repeated information with no state change, or anything that is not useful project information.
- Never output purchase prices or personal payment amounts.
- Raw chat belongs only in Project Record; changes describe canonical state for derived views.
- Resolve or dismiss an existing record only when the message clearly refers to it. Use its exact id as targetRecordId.
- "done", "cleared", "resolved", "approved" and "no longer blocked" normally resolve. "not needed", "not required" and "remove from scope" dismiss.
- Imperatives and commitments are actions. A stated choice is a decision. A constraint stopping progress is a blocker.
- Deliveries require an item plus arrival/delivery/installation information. Capture vendor and room only when stated or unambiguous.
- Use requiresReview=true whenever identity, reference, room, vendor, owner, target, homeowner agreement or status is materially ambiguous.
- Confidence below 0.82 must require review. Put one concise question for Mel in clarification when review is needed.
- Split compound messages into distinct changes. Ignore headings, list numbers and conversational filler.
- Dates must be ISO 8601 when explicit and unambiguous; otherwise null.
- Use area and room only from the allowed schema values.`,
      prompt: `Current date: ${new Date().toISOString()}
Project memory:
${compactProjectMemory()}

Baseline job schedule:
${compactProjectSchedule()}

Active Telegram session (chronological; the final line is the newest contribution):
${sourceText || "[attachment without caption]"}

Recent project records available for reconciliation:
${JSON.stringify(context)}`,
      providerOptions: {
        gateway: {
          user: String(message.chat?.id || "plinth"),
          tags: ["product:plinth", "feature:telegram-reconciliation"],
          order: ["anthropic"],
          only: ["anthropic"]
        }
      }
    });

    const output = result.output;
    const validIds = new Set(context.map(record => record.id));
    const changes = output.changes.map(change => {
      const suppliedTarget = change.targetRecordId && validIds.has(change.targetRecordId) ? change.targetRecordId : null;
      const targetRecordId = suppliedTarget || (["resolve", "dismiss"].includes(change.operation) ? findUniqueTarget(change, context) : null);
      const unmatchedMutation = ["update", "resolve", "dismiss"].includes(change.operation) && !targetRecordId;
      const permittedStandaloneResolution = options.allowStandaloneResolutions && ["resolve", "dismiss"].includes(change.operation);
      const requiresReview = (change.requiresReview && !permittedStandaloneResolution) || change.confidence < 0.82 || (unmatchedMutation && !permittedStandaloneResolution);
      return { ...change, targetRecordId, requiresReview, applied: !requiresReview };
    }).filter((change, index, all) => {
      if (all.findIndex(candidate => candidate.operation === change.operation && candidate.status === change.status && topicScore(candidate.text, change.text) >= 0.9) !== index) return false;
      if (change.operation !== "create") return true;
      return !context.some(record => !["completed", "dismissed"].includes(record.status) && record.area === change.area && topicScore(record.text, change.text) >= 0.85);
    });
    return { ...output, changes, model: AI_MODEL, mode: "ai", usage: result.totalUsage || result.usage };
  } catch (error) {
    console.error("[plinth-ai] interpretation failed", { name: error?.name, message: error?.message });
    return fallbackInterpretation(message, error);
  }
}

export function aiAcknowledgement(interpretation, options = {}) {
  const applied = interpretation.changes.filter(change => change.applied).length;
  if (interpretation.mode !== "ai" || (interpretation.changes.length === 0 && !options.force)) return null;
  const review = interpretation.changes.length - applied;
  const viewUrl = review
    ? "https://plinth-duchess.vercel.app/?view=review"
    : "https://plinth-duchess.vercel.app/";
  if (review) {
    const clarification = interpretation.clarification ? `\n\nFor Mel: ${interpretation.clarification}` : "";
    return `Plinth reviewed this conversation.\n\n${applied} project change${applied === 1 ? "" : "s"} applied · ${review} item${review === 1 ? "" : "s"} need Mel Review.${clarification}\n\nOpen Mel Review:\n${viewUrl}`;
  }
  return `Plinth consolidated this conversation.\n\n${interpretation.summary || "The project record is current."}\n${applied} project change${applied === 1 ? "" : "s"} applied.\n\nView consolidated progress:\n${viewUrl}`;
}

function splitStatements(text) {
  return text.split(/\n+/).flatMap(line => {
    const cleaned = line.trim().replace(/^(?:[-*•—]+\s*|\d+[.)]\s*)/, "").trim();
    if (!cleaned || /^add:?$/i.test(cleaned)) return [];
    return (cleaned.match(/[^.!?]+[.!?]?/g) || []).map(value => value.trim()).filter(Boolean);
  });
}

const roomRules = [
  ["Living room", /living room|tv console|sonos|speaker/i],
  ["Dining room", /dining|dining table|dining chair/i],
  ["Kitchen", /kitchen|hood|hob|sink|mixer|rinser|dishwasher/i],
  ["Wine lounge", /wine lounge|wine counter|wine fridge/i],
  ["Master bedroom", /master bedroom|master wardrobe|master bath/i],
  ["Bedroom 2 + bath", /bedroom 2|mom'?s room|common bathroom|towel storage/i],
  ["Study room", /study room|murphy bed/i],
  ["Helper’s room + WC", /helper'?s room|helper wc|loft bed/i],
  ["Airwell / courtyard", /airwell|courtyard|polycarbonate|outdoor bench/i],
  ["Basement / parking", /basement|parking|sauna|switch.?box/i],
  ["Whole unit", /section 47|management|inspection|key|access|whole (house|unit)|all rooms/i],
];

const areaRules = [
  ["Deliveries & installation", /deliver|arrival|ship|schedule|install|access slot/i],
  ["Products & equipment", /order|purchase|furniture|appliance|sofa|table|chair|bed|sink|hood|speaker/i],
  ["Carpentry & built-ins", /carpentry|cabinet|wardrobe|drawer|shel|murphy bed/i],
  ["Specialist trades", /paint|polycarbonate|door|electrical|aircon|mesh|blind|curtain|landscap/i],
  ["Testing & handover", /defect|rectif|test|commission|handover/i],
  ["Project control", /section 47|management|inspection|key|access|approval|permission|commencement|programme|meeting/i],
  ["Renovation works", /renovation|demol|hack|tile|ceiling|plaster|wall|floor|build/i],
];

export function inferRecordContext(text) {
  const room = roomRules.find(([, pattern]) => pattern.test(text))?.[0] || null;
  const area = areaRules.find(([, pattern]) => pattern.test(text))?.[0] || "Project control";
  const status = /not (?:needed|required)|no longer needed|cancel+ed|remove(?:d)? from scope/.test(text.toLowerCase())
    ? "dismissed"
    : /clear(ed)?|complete(d)?|done|resolved|passed|finished|no longer blocked/.test(text.toLowerCase())
      ? "completed"
    : /confirm(ed)?|agree(d)?|approve(d)?|ordered|paid|selected/.test(text.toLowerCase())
      ? "confirmed"
      : /block(ed)?|delay(ed)?|cannot|can't|issue|problem|clash/.test(text.toLowerCase())
        ? "blocked"
        : "open";
  return { room, area, status };
}

function classifyStatement(text) {
  const lower = text.toLowerCase();
  const context = inferRecordContext(text);
  if (/\?|can you|could you|do we|should we|is it|are we|what |where |when |why |how /.test(lower)) return { kind: "question", text, ...context };
  if (/issue|problem|clash|delay|damag|blocked|cannot|can't|not allowed|missing|wrong|leak|defect/.test(lower)) return { kind: "issue", text, ...context };
  if (/decided|confirmed|agreed|approved|go with|use the|will use|prefer|no need|not needed|not required|remove the|change to|keep the/.test(lower)) return { kind: "decision", text, ...context };
  if (context.status === "completed" && /permission|commencement|inspection/.test(lower)) return { kind: "action", text, ...context };
  if (/need to|needs to|please|follow up|check |measure|arrange|schedule|order |send |label |test |install |complete |rectify|update |make payment|pay /.test(lower) || /^\w+\s+to\s+(?:make|send|update|pay|confirm|arrange|check)\b/.test(lower)) return { kind: "action", text, ...context };
  return { kind: "evidence", text, ...context };
}

export function classifyRecords(message) {
  const text = (message.text || message.caption || "").trim();
  if (message.photo?.length || message.document) {
    const evidenceText = text || (message.photo?.length ? "Site photo" : "Project document");
    return [{ kind: "evidence", text: evidenceText, ...inferRecordContext(evidenceText) }];
  }
  const statements = splitStatements(text || "Project update");
  return statements.map(classifyStatement);
}

export function classifyMessage(message) {
  return classifyRecords(message)[0];
}

export function acknowledgement(input) {
  const records = Array.isArray(input) ? input : [input];
  const labels = { decision: "decision", action: "action", issue: "issue", question: "question", evidence: "update" };
  const dashboardLink = "\n\nThis session will consolidate after 5 minutes with no new messages.\nOpen the Duchess Project Record:\nhttps://plinth-duchess.vercel.app";
  if (records.length === 1) {
    const record = records[0];
    return `Added to the active Plinth session · 1 ${labels[record.kind]} captured\n${record.text}${dashboardLink}`;
  }
  const counts = records.reduce((result, record) => {
    result[record.kind] = (result[record.kind] || 0) + 1;
    return result;
  }, {});
  const summary = Object.entries(counts).map(([kind, count]) => `${count} ${labels[kind]}${count > 1 ? "s" : ""}`).join(", ");
  return `Added to the active Plinth session · ${records.length} records captured\n${summary}${dashboardLink}`;
}

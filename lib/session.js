export function catchupRequested(text = "") {
  const normalized = String(text).trim().toLowerCase();
  if (!normalized) return false;

  if (/(?:^|\b)(?:\/catchup|\/sync|catch up|sync|reconcile)(?:\b|$)/i.test(normalized)) return true;

  const asksToProcess = /\b(?:read|review|learn|understand|process|interpret|capture|summari[sz]e|consolidate|update)\b/i.test(normalized);
  const namesConversation = /\b(?:session|conversation|chat|history|messages?|everything|all|complete|whole|so far)\b/i.test(normalized);
  const namesProjectRecord = /\bproject records?\b/i.test(normalized);

  return asksToProcess && (namesConversation || namesProjectRecord);
}

export function combineSessionMessages(updates = []) {
  const seen = new Set();
  return updates.map(update => {
    const message = update.raw_message || {};
    const content = String(message.text || message.caption || "").trim();
    const signature = content.toLowerCase();
    if (!content || catchupRequested(content) || seen.has(signature)) return null;
    seen.add(signature);
    return `${update.sender_name || "Telegram member"}: ${content}`;
  }).filter(Boolean).join("\n");
}

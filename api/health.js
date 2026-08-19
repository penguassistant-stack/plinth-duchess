import { supabaseConfigured } from "../lib/supabase.js";

export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    service: "plinth-telegram-receiver",
    database: supabaseConfigured() ? "configured" : "missing",
    telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET ? "configured" : "missing",
    aiGateway: process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY ? "configured" : "missing",
  });
}

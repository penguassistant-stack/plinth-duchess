const PROJECT_URL = process.env.SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(prefer) {
  if (!PROJECT_URL || !SECRET_KEY) {
    throw new Error("Supabase environment variables are not configured");
  }

  return {
    apikey: SECRET_KEY,
    authorization: `Bearer ${SECRET_KEY}`,
    "content-type": "application/json",
    ...(prefer ? { prefer } : {}),
  };
}

export async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers(options.prefer), ...(options.headers || {}) },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }

  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export function supabaseConfigured() {
  return Boolean(PROJECT_URL && SECRET_KEY);
}

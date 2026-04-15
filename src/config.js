import alertsConfig from "../config/alerts.json" with { type: "json" };

const DEFAULT_API_URL = "https://api.hyperliquid.xyz";

export function getAlertsConfig() {
  return alertsConfig;
}

export function loadWorkerConfig(env) {
  if (!env?.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL.");
  }

  if (!env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    apiUrl: env.HYPERLIQUID_API_URL || DEFAULT_API_URL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

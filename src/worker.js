import { getAlertsConfig, loadWorkerConfig } from "./config.js";
import { HyperliquidClient } from "./hyperliquid.js";
import { runAlertChecks } from "./alert-runner.js";
import { SupabaseNotifier } from "./supabase-notifier.js";
import { SupabaseRestClient } from "./supabase-rest.js";
import { SupabaseStateStore } from "./supabase-state-store.js";

export default {
  async scheduled(controller, env, ctx) {
    const config = loadWorkerConfig(env);
    const client = new HyperliquidClient({
      apiUrl: config.apiUrl,
    });
    const supabase = new SupabaseRestClient({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
    });
    const notifier = new SupabaseNotifier(supabase);
    const stateStore = new SupabaseStateStore(supabase);

    ctx.waitUntil(
      runAlertChecks({
        rawConfig: getAlertsConfig(),
        client,
        notifier,
        stateStore,
        now: new Date(controller.scheduledTime),
      }),
    );
  },
};

import {
  extractCommandText,
  formatRuleConfirmation,
  formatRulesList,
  parseAlertRuleCommand,
} from "../../../src/alert-rule-commands.js";
import { SupabaseRestClient } from "../../../src/supabase-rest.js";

Deno.serve(async (request) => {
  const authError = validateAdminAuth(request);
  if (authError) {
    return jsonResponse({ ok: false, message: authError }, 401);
  }

  const payload = await parseRequestPayload(request);
  const commandText = extractCommandText(payload);
  const command = parseAlertRuleCommand(commandText);
  const client = createSupabaseClient(request);

  if (command.action === "help") {
    return jsonResponse({ ok: true, message: command.message });
  }

  if (command.action === "list") {
    const rules = await client.select("alert_rules", {
      enabled: "eq.true",
      order: "created_at.asc",
      select: "*",
    });

    return jsonResponse({
      ok: true,
      message: formatRulesList(
        rules.map((rule) => ({
          id: rule.rule_id,
          market: rule.market,
          symbol: rule.symbol,
          dex: rule.dex || "",
          direction: rule.direction,
          threshold: Number(rule.threshold),
        })),
      ),
      rules,
    });
  }

  if (command.action === "upsert") {
    const now = new Date().toISOString();
    await client.upsert(
      "alert_rules",
      {
        rule_id: command.rule.id,
        market: command.rule.market,
        symbol: command.rule.symbol,
        dex: command.rule.dex || null,
        canonical_coin: command.rule.canonicalCoin || null,
        direction: command.rule.direction,
        threshold: command.rule.threshold,
        enabled: true,
        updated_at: now,
      },
      { returning: "minimal" },
    );

    return jsonResponse({
      ok: true,
      message: formatRuleConfirmation("saved", command.rule),
      rule: command.rule,
    });
  }

  if (command.action === "remove") {
    const deleted = await client.delete(
      "alert_rules",
      {
        rule_id: `eq.${command.ruleId}`,
      },
      { returning: "representation" },
    );

    if (!Array.isArray(deleted) || deleted.length === 0) {
      return jsonResponse({
        ok: true,
        message: `No matching alert found for ${command.rule.symbol} ${command.rule.direction} ${command.rule.threshold}.`,
      });
    }

    return jsonResponse({
      ok: true,
      message: formatRuleConfirmation("removed", command.rule),
      removed_rule_id: command.ruleId,
    });
  }

  return jsonResponse({ ok: false, message: "Unsupported command." }, 400);
});

function createSupabaseClient(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for manage-alert-rules.");
  }

  return new SupabaseRestClient({
    url: baseUrl,
    serviceRoleKey,
  });
}

async function parseRequestPayload(request: Request) {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function validateAdminAuth(request: Request) {
  const expectedToken = Deno.env.get("RULES_ADMIN_TOKEN");
  if (!expectedToken) {
    return null;
  }

  const authHeader = request.headers.get("authorization");
  const explicitToken = request.headers.get("x-admin-token");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (explicitToken === expectedToken || bearer === expectedToken) {
    return null;
  }

  return "Unauthorized.";
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

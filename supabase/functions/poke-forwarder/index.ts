interface WebhookRecord {
  rule_id: string;
  coin: string;
  symbol: string;
  market: string;
  direction: string;
  threshold: number;
  price: number;
  triggered_at: string;
  message: string;
}

interface DatabaseWebhookPayload {
  type?: string;
  table?: string;
  record?: WebhookRecord | null;
}

Deno.serve(async (request) => {
  const payload = (await request.json()) as DatabaseWebhookPayload;
  const record = payload?.record;

  if (!record) {
    return jsonResponse(
      {
        error: "Missing record in database webhook payload.",
      },
      400,
    );
  }

  const webhookUrl = Deno.env.get("POKE_WEBHOOK_URL");
  const bearerToken = Deno.env.get("POKE_BEARER_TOKEN");

  if (!webhookUrl || !bearerToken) {
    return jsonResponse(
      {
        error: "Missing POKE_WEBHOOK_URL or POKE_BEARER_TOKEN secret.",
      },
      500,
    );
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      message: record.message,
      rule_id: record.rule_id,
      coin: record.coin,
      symbol: record.symbol,
      market: record.market,
      direction: record.direction,
      threshold: record.threshold,
      price: record.price,
      triggered_at: record.triggered_at,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return jsonResponse(
      {
        error: `Poke webhook failed: ${response.status} ${body}`,
      },
      502,
    );
  }

  return jsonResponse({
    ok: true,
    forwarded_table: payload.table ?? null,
    forwarded_event: payload.type ?? null,
    rule_id: record.rule_id,
  });
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

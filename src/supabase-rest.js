export class SupabaseRestClient {
  constructor({ url, serviceRoleKey, fetchImpl = fetch }) {
    this.baseUrl = url.replace(/\/$/u, "");
    this.serviceRoleKey = serviceRoleKey;
    this.fetchImpl = fetchImpl;
  }

  async selectSingle(table, query) {
    const response = await this.request(table, {
      method: "GET",
      query: {
        ...query,
        select: "*",
        limit: "1",
      },
      headers: {
        Accept: "application/vnd.pgrst.object+json",
      },
      allowStatuses: [406],
    });

    if (response.status === 406) {
      return null;
    }

    return response.json();
  }

  async upsert(table, payload, options = {}) {
    const query = {};
    if (options.returning === "minimal") {
      query.select = "";
    }

    await this.request(table, {
      method: "POST",
      query,
      headers: {
        Prefer: buildPreferHeader({
          resolution: "merge-duplicates",
          returning: options.returning || "representation",
        }),
      },
      body: payload,
    });
  }

  async insert(table, payload, options = {}) {
    const response = await this.request(table, {
      method: "POST",
      headers: {
        Prefer: buildPreferHeader({
          returning: options.returning || "representation",
        }),
      },
      body: payload,
    });

    if (options.returning === "minimal") {
      return null;
    }

    return response.json();
  }

  async request(table, { method, query, headers = {}, body, allowStatuses = [] } = {}) {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok || allowStatuses.includes(response.status)) {
      return response;
    }

    const errorText = await response.text();
    throw new Error(`Supabase request failed for ${table}: ${response.status} ${errorText}`);
  }
}

function buildPreferHeader({ resolution, returning }) {
  const values = [];
  if (resolution) {
    values.push(`resolution=${resolution}`);
  }
  if (returning) {
    values.push(`return=${returning}`);
  }
  return values.join(",");
}

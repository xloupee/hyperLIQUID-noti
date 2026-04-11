import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AlertApp } from "../src/app.js";
import { JsonStateStore } from "../src/state-store.js";

test("AlertApp sends only on threshold crossing and persists state", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hl-alert-"));
  const rulesPath = path.join(tempDir, "alerts.json");
  const statePath = path.join(tempDir, "state.json");

  fs.writeFileSync(
    rulesPath,
    JSON.stringify({
      rules: [
        {
          id: "btc-above",
          market: "perp",
          symbol: "BTC",
          dex: "vntl",
          direction: "above",
          threshold: "100",
          enabled: true,
        },
      ],
    }),
  );

  const sent = [];
  const client = {
    async resolveRules(rules) {
      return rules.map((rule) => ({
        ...rule,
        coin: "BTC",
        displayName: "BTC",
      }));
    },
    createPriceStream() {
      return {
        start() {},
        stop() {},
      };
    },
  };

  const notifier = {
    async sendAlert(payload) {
      sent.push(payload);
    },
  };

  const stateStore = new JsonStateStore(statePath);
  const app = new AlertApp({
    client,
    notifier,
    stateStore,
    rulesPath,
    logger: {
      info() {},
      error() {},
    },
  });

  await app.init();
  await app.handlePrice({ coin: "BTC", price: 99 });
  await app.handlePrice({ coin: "BTC", price: 101 });
  await app.handlePrice({ coin: "BTC", price: 105 });
  await app.handlePrice({ coin: "BTC", price: 95 });
  await app.handlePrice({ coin: "BTC", price: 101 });

  assert.equal(sent.length, 2);
  assert.equal(sent[0].rule.id, "btc-above");
  assert.equal(sent[0].rule.dex, "vntl");

  const persisted = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.equal(persisted.rules["btc-above"].lastPrice, 101);
});

import fs from "node:fs";
import path from "node:path";

export class JsonStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { rules: {} };
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return this.state;
    }

    const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (!raw || typeof raw !== "object" || typeof raw.rules !== "object") {
      return this.state;
    }
    this.state = raw;
    return this.state;
  }

  getRuleState(ruleId) {
    return this.state.rules[ruleId] || null;
  }

  setRuleState(ruleId, value) {
    this.state.rules[ruleId] = value;
  }

  flush() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2) + "\n", "utf8");
  }
}

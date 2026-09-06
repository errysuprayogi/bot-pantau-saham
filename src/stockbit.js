const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const CALL_TIMEOUT_MS = 90000;
const STARTUP_TIMEOUT_MS = 30000;

class StockbitClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.client = null;
    this.transport = null;
  }

  async call(tool, args = {}) {
    await this._ensure();
    const res = await this._timeout(
      this.client.callTool({ name: tool, arguments: args }),
      CALL_TIMEOUT_MS,
      `[${tool}] timeout setelah ${CALL_TIMEOUT_MS} ms`
    );
    return this._unpack(res, tool);
  }

  _unpack(res, tool) {
    if (res && res.isError) {
      throw new Error(
        `[${tool}] error: ${(res.content || [])
          .map((c) => c.text || "")
          .join("\n") || "tanpa detail"}`
      );
    }
    const text = (res && res.content || []).filter(
      (c) => c.type === "text"
    )[0];
    if (!text) throw new Error(`[${tool}] respon tanpa konten teks`);
    let parsed;
    try {
      parsed = JSON.parse(text.text);
    } catch (e) {
      throw new Error(`[${tool}] respon bukan JSON: ${text.text.slice(0, 200)}`);
    }
    if (parsed && parsed.success === false) {
      throw new Error(`[${tool}] gagal: ${JSON.stringify(parsed.error || parsed)}`);
    }
    return parsed && parsed.data !== undefined ? parsed.data : parsed;
  }

  async _ensure() {
    if (this.client) return;
    const serverEnv = {
      ...process.env,
      STOCKBIT_TOOLS: this.cfg.tools
    };
    this.transport = new StdioClientTransport({
      command: this.cfg.node,
      args: [this.cfg.script],
      env: serverEnv,
      cwd: path.dirname(this.cfg.script),
      stderr: "pipe"
    });
    this.client = new Client({ name: "bot-pantau-saham", version: "1.0.0" });
    this.transport.onclose = () => {
      this.client = null;
      this.transport = null;
    };
    await this._timeout(
      this.client.connect(this.transport),
      STARTUP_TIMEOUT_MS,
      "server Stockbit MCP tidak merespon saat koneksi"
    );
  }

  _timeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        /* abaikan */
      }
    }
    this.client = null;
    this.transport = null;
  }
}

module.exports = { StockbitClient };
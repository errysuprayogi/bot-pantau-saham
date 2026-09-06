const fs = require("node:fs");
const TelegramBot = require("node-telegram-bot-api");
const { config } = require("./config");

const HELP = [
  "Halo! Saya bot rekap pasar IDX (sumber data: Stockbit).",
  "",
  "Perintah:",
  "/start - daftarkan chat ini untuk menerima laporan",
  "/now - kirim laporan pagi + sore sekarang",
  "/pagi - kirim laporan pagi saja",
  "/sore - kirim rekapan sore saja",
  "",
  "Jadwal otomatis (WIB, Senin-Jumat):",
  `  ${config.scheduleMorning}  pre-market briefing`,
  `  ${config.scheduleEvening}  recap harian`,
  "",
  "Isi laporan: IHSG, top gainer/loser, akumulasi & jual asing, radar bandar/modal besar, dan berita."
].join("\n");

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

class Messenger {
  constructor(jobRunner) {
    this.jobRunner = jobRunner || null;
    this.bot = null;
    this.chatId = config.chatId || this._loadState();
  }

  _loadState() {
    try {
      const s = JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
      return s.chatId || "";
    } catch (e) {
      return "";
    }
  }

  _saveState(chatId) {
    try {
      let s = {};
      try {
        s = JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
      } catch (e) {
        /* file belum ada */
      }
      s.chatId = String(chatId);
      fs.writeFileSync(config.stateFile, JSON.stringify(s, null, 2));
    } catch (e) {
      console.error("Gagal menyimpan chat id:", e.message);
    }
  }

  async start(poll = true) {
    this.bot = new TelegramBot(config.botToken, { polling: poll });
    if (poll) {
      this.bot.on("message", (msg) => this._onMessage(msg));
    }
    const me = await this.bot.getMe();
    return me;
  }

  async _onMessage(msg) {
    const txt = (msg.text || "").trim();
    if (!txt.startsWith("/")) return;
    const chat = msg.chat && msg.chat.id;
    const cmd = txt.split(/\s+/)[0].toLowerCase();
    const reply = (text) =>
      this.bot.sendMessage(chat, text, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });

    if (!this.chatId && chat) {
      this.chatId = String(chat);
      this._saveState(this.chatId);
    }

    if (cmd === "/start" || cmd === "/help") {
      await reply(escHtml(HELP));
      return;
    }

    if (cmd === "/now" || cmd === "/pagi" || cmd === "/sore" || cmd === "/test") {
      if (!this.jobRunner) {
        await reply("Mode tanpa pengiriman aktif; perintah laporan dinonaktifkan.");
        return;
      }
      await reply("Permintaan diterima, laporan sedang disusun...");
      try {
        const ok = await this.jobRunner({
          morning: cmd === "/pagi" || cmd === "/now",
          evening: cmd === "/sore" || cmd === "/now"
        });
        await reply(ok ? "Selesai." : "Gagal menyusun laporan, cek log bot.");
      } catch (e) {
        await reply("Error: " + escHtml(e.message));
      }
    }
  }

  hasChatId() {
    return !!this.chatId;
  }

  async send(text) {
    if (!this.bot) throw new Error("bot belum di-start");
    if (!this.chatId) {
      throw new Error("Chat belum terdaftar: kirim /start ke bot, atau isi TELEGRAM_CHAT_ID di .env");
    }
    return this.bot.sendMessage(this.chatId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  }

  async stop() {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
      } catch (e) {
        /* abaikan */
      }
    }
  }
}

module.exports = { Messenger };
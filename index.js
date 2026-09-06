const cron = require("node-cron");
const { config } = require("./src/config");
const { StockbitClient } = require("./src/stockbit");
const { buildMorning, buildEvening } = require("./src/reports");
const { Messenger } = require("./src/telegram");

const argv = process.argv.slice(2);
const opts = {
  once: argv.includes("--once"),
  morning: argv.includes("--morning"),
  evening: argv.includes("--evening"),
  noSend: argv.includes("--no-send") || argv.includes("--dry")
};
const isOnce = opts.once || opts.noSend;
const wantMorning = opts.morning || !opts.evening;
const wantEvening = opts.evening || !opts.morning;

const client = new StockbitClient(config.server);

async function buildReport(kind) {
  return kind === "morning" ? buildMorning(client) : buildEvening(client);
}

async function sendReport(kind, messenger) {
  const messages = await buildReport(kind);
  if (!messenger) {
    messages.forEach((m) => {
      console.log(m);
      console.log("=".repeat(42));
    });
    return messages.length;
  }
  for (const m of messages) {
    await messenger.send(m);
  }
  return messages.length;
}

function jobRunner(messenger) {
  return async ({ morning, evening }) => {
    let ok = true;
    const kinds = [];
    if (morning) kinds.push("morning");
    if (evening) kinds.push("evening");
    if (!kinds.length) return false;
    for (const kind of kinds) {
      try {
        const n = await sendReport(kind, messenger);
        console.log(`[${new Date().toISOString()}] ${kind} terkirim (${n} pesan)`);
      } catch (e) {
        ok = false;
        console.error(`[${new Date().toISOString()}] ${kind} GAGAL:`, e.message);
      }
    }
    return ok;
  };
}

async function main() {
  if (!opts.noSend && !config.botToken) {
    console.error(
      [
        "TELEGRAM_BOT_TOKEN belum diisi di file .env",
        "",
        "1. Buka @BotFather di Telegram, /newbot, ikuti pertanyaan.",
        "2. Salin token (format 123456:ABC-DEF...) ke .env -> TELEGRAM_BOT_TOKEN=...",
        "3. Kirim /start ke bot Anda, chat id tersimpan otomatis.",
        "4. Jalankan lagi: node index.js"
      ].join("\n")
    );
    process.exit(1);
  }

  const messenger = opts.noSend ? null : new Messenger(null);

  if (opts.noSend) {
    const ok = await jobRunner(null)({
      morning: wantMorning,
      evening: wantEvening
    });
    await client.close();
    process.exit(ok ? 0 : 1);
  }

  messenger.jobRunner = jobRunner(messenger);
  await messenger.start(!isOnce);
  const me = await messenger.bot.getMe();
  if (messenger.hasChatId()) {
    console.log(`Bot @${me.username} aktif. Chat tujuan: ${messenger.chatId}`);
  } else {
    console.log(`Bot @${me.username} aktif. Kirim /start ke bot untuk mendaftarkan chat.`);
  }

  if (isOnce) {
    const ok = await messenger.jobRunner({
      morning: wantMorning,
      evening: wantEvening
    });
    await messenger.stop();
    await client.close();
    process.exit(ok ? 0 : 1);
  }

  const kind = (morning, evening) => ({
    morning,
    evening
  });

  if (config.sendMorning) {
    cron.schedule(config.scheduleMorning, () => {
      console.log(`[${new Date().toISOString()}] jadwal pagi dipicu`);
      messenger.jobRunner(kind(true, false));
    }, { timezone: config.timezone });
    console.log(`Jadwal pagi  : ${config.scheduleMorning} (${config.timezone})`);
  }
  if (config.sendEvening) {
    cron.schedule(config.scheduleEvening, () => {
      console.log(`[${new Date().toISOString()}] jadwal sore dipicu`);
      messenger.jobRunner(kind(false, true));
    }, { timezone: config.timezone });
    console.log(`Jadwal sore  : ${config.scheduleEvening} (${config.timezone})`);
  }

  console.log("Bot berjalan. Ctrl+C untuk berhenti.");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Menghentikan bot...");
  client.close();
  process.exit(0);
}
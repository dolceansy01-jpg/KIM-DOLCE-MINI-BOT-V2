const express = require("express");
const makeWASocket = require("@whiskeysockets/baileys").default;
const {
useMultiFileAuthState,
DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let sock;
let qrCode = "";
let botStatus = "disconnected";
let pairingCode = "";

async function startBot() {
const { state, saveCreds } = await useMultiFileAuthState("sessions");

sock = makeWASocket({
auth: state,
logger: pino({ level: "silent" }),
browser: ["KIM DOLCE MINI BOT V2", "Chrome", "1.0.0"]
});

sock.ev.on("creds.update", saveCreds);

sock.ev.on("connection.update", async (update) => {
const { connection, lastDisconnect, qr } = update;

if (qr) {
  qrCode = await QRCode.toDataURL(qr);
  botStatus = "waiting_for_scan";
}

if (connection === "open") {
  botStatus = "connected";
  qrCode = "";
  pairingCode = "";
  console.log("KIM DOLCE MINI BOT V2 connected!");
}

if (connection === "close") {
  botStatus = "disconnected";
  const code = lastDisconnect?.error?.output?.statusCode;

  if (code !== DisconnectReason.loggedOut) {
    setTimeout(startBot, 3000);
  }
}

});

sock.ev.on("messages.upsert", async ({ messages, type }) => {
if (type !== "notify") return;

for (const message of messages) {
  if (!message.message || message.key.fromMe) continue;

  const jid = message.key.remoteJid;
  if (!jid || jid.endsWith("@g.us")) continue;

  const textMessage =
    message.message.conversation ||
    message.message.extendedTextMessage?.text ||
    "";

  const text = textMessage.trim().toLowerCase();

  if (text === "!ping") {
    await sock.sendMessage(jid, { text: "Pong! 🤖 KIM DOLCE MINI BOT V2 aktif." });
  } else if (text === "!menu" || text === "!help") {
    await sock.sendMessage(jid, {
      text:
        "👑 *KIM DOLCE MINI BOT V2*\n\n" +
        "1. !menu — Gade meni a\n" +
        "2. !ping — Teste bot la\n" +
        "3. !help — Èd\n\n" +
        "Bot la konekte avèk siksè! 🔥"
    });
  }
}

});
}

app.get("/health", (req, res) => {
res.json({ ok: true, app: "KIM DOLCE MINI BOT V2" });
});

app.get("/api/status", (req, res) => {
res.json({ status: botStatus });
});

app.get("/api/qr", (req, res) => {
res.json({ qr: qrCode });
});

app.post("/api/pair", async (req, res) => {
try {
const phone = String(req.body.phone || "").replace(/\D/g, "");

if (!phone || phone.length < 8 || phone.length > 15) {
  return res.status(400).json({
    error: "Mete nimewo WhatsApp la avèk kòd peyi a."
  });
}

if (!sock) {
  return res.status(503).json({
    error: "Bot la poko demare. Eseye ankò."
  });
}

if (sock.authState?.creds?.registered) {
  return res.status(400).json({
    error: "Bot la deja anrejistre."
  });
}

pairingCode = await sock.requestPairingCode(phone);
res.json({ code: pairingCode });

} catch (error) {
console.error("Pairing error:", error.message);
res.status(500).json({
error: "Pa kapab jenere kòd la. Eseye ankò."
});
}
});

app.get("/api/pair", (req, res) => {
res.json({ code: pairingCode });
});

app.listen(PORT, () => {
console.log("KIM DOLCE MINI BOT V2 ap kouri sou pò ${PORT}");
startBot().catch((err) => console.error("Bot error:", err));
});
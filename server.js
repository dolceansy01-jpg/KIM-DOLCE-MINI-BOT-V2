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

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

let sock = null;
let authState = null;
let qrCode = "";
let pairingCode = "";
let botStatus = "starting";
let pairingReady = false;
let pairingInProgress = false;
let startInProgress = false;

let pairingReadyResolve = null;

let pairingReadyPromise = new Promise((resolve) => {
  pairingReadyResolve = resolve;
});

function resetPairingReady() {
  pairingReady = false;

  pairingReadyPromise = new Promise((resolve) => {
    pairingReadyResolve = resolve;
  });
}

function waitForPairingReady(timeout = 20000) {
  if (pairingReady) {
    return Promise.resolve(true);
  }

  return Promise.race([
    pairingReadyPromise,
    new Promise((resolve) => {
      setTimeout(() => resolve(false), timeout);
    })
  ]);
}

async function startBot() {
  if (startInProgress) return;

  startInProgress = true;

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState(
        path.join(__dirname, "sessions")
      );

    authState = state;

    if (state.creds.registered) {
      botStatus = "connecting";
    } else {
      botStatus = "waiting_for_pairing";
    }

    resetPairingReady();

    sock = makeWASocket({
      auth: state,

      logger: pino({
        level: "silent"
      }),

      browser: [
        "Ubuntu",
        "Chrome",
        "20.0.04"
      ],

      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        if (qr) {
          try {
            qrCode = await QRCode.toDataURL(qr);
          } catch (error) {
            console.error(
              "QR generation error:",
              error.message
            );
          }

          if (!authState?.creds?.registered) {
            pairingReady = true;
            botStatus = "waiting_for_pairing";

            if (pairingReadyResolve) {
              pairingReadyResolve(true);
            }
          }
        }

        if (connection === "connecting") {
          console.log(
            "KIM DOLCE MINI BOT V2 ap konekte..."
          );
        }

        if (connection === "open") {
          botStatus = "connected";
          qrCode = "";
          pairingCode = "";
          pairingReady = false;

          console.log(
            "KIM DOLCE MINI BOT V2 konekte avèk siksè!"
          );
        }

        if (connection === "close") {
          botStatus = "disconnected";
          pairingReady = false;

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          console.log(
            "WhatsApp connection closed:",
            statusCode || "unknown"
          );

          if (
            statusCode !== DisconnectReason.loggedOut
          ) {
            setTimeout(() => {
              startBot().catch((error) => {
                console.error(
                  "Reconnect error:",
                  error.message
                );
              });
            }, 5000);
          } else {
            console.log(
              "Sesyon an soti. Verifye koneksyon WhatsApp la."
            );
          }
        }
      }
    );

    sock.ev.on(
      "messages.upsert",
      async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const message of messages) {
          if (
            !message.message ||
            message.key.fromMe
          ) {
            continue;
          }

          const jid = message.key.remoteJid;

          if (
            !jid ||
            jid.endsWith("@g.us") ||
            jid === "status@broadcast"
          ) {
            continue;
          }

          const messageText =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            message.message.imageMessage?.caption ||
            "";

          const text = messageText
            .trim()
            .toLowerCase();

          if (text === "!ping") {
            await sock.sendMessage(jid, {
              text:
                "Pong! 🤖 KIM DOLCE MINI BOT V2 aktif."
            });
          }

          if (
            text === "!menu" ||
            text === "!help"
          ) {
            await sock.sendMessage(jid, {
              text:
                "👑 KIM DOLCE MINI BOT V2\n\n" +
                "📌 !menu — Gade meni a\n" +
                "📌 !ping — Teste bot la\n" +
                "📌 !help — Èd\n\n" +
                "🔥 Bot la ap fonksyone!"
            });
          }
        }
      }
    );

  } catch (error) {
    botStatus = "error";

    console.error(
      "Bot startup error:",
      error.message
    );

    throw error;
  } finally {
    startInProgress = false;
  }
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "KIM DOLCE MINI BOT V2",
    status: botStatus
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    status: botStatus,
    connected: botStatus === "connected"
  });
});

app.get("/api/qr", (req, res) => {
  res.json({
    qr: qrCode
  });
});

app.get("/api/pair", (req, res) => {
  res.json({
    code: pairingCode
  });
});

app.post("/api/pair", async (req, res) => {
  if (pairingInProgress) {
    return res.status(429).json({
      error:
        "Yon demann koneksyon deja an kou. Tann kèk segonn."
    });
  }

  pairingInProgress = true;

  try {
    const phone = String(
      req.body.phone || ""
    ).replace(/\D/g, "");

    if (
      !phone ||
      phone.length < 8 ||
      phone.length > 15
    ) {
      return res.status(400).json({
        error:
          "Mete nimewo a avèk kòd peyi a, chif sèlman."
      });
    }

    if (!sock || !authState) {
      return res.status(503).json({
        error:
          "Bot la poko pare. Tann 20 segonn epi eseye ankò."
      });
    }

    if (authState.creds.registered) {
      return res.status(400).json({
        error:
          "Gen yon sesyon WhatsApp ki deja anrejistre."
      });
    }

    const ready = await waitForPairingReady(20000);

    if (!ready || !sock) {
      return res.status(503).json({
        error:
          "WhatsApp poko pare pou jenere kòd la. Tann kèk segonn epi eseye ankò."
      });
    }

    pairingCode = "";

    const code = await sock.requestPairingCode(phone);

    pairingCode = code;

    console.log(
      "Pairing code generated successfully."
    );

    return res.json({
      code: code
    });

  } catch (error) {
    console.error(
      "Pairing error:",
      error.message
    );

    return res.status(500).json({
      error:
        "WhatsApp pa t aksepte demann nan. Tann yon ti tan epi eseye ankò."
    });

  } finally {
    pairingInProgress = false;
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `KIM DOLCE MINI BOT V2 ap kouri sou pò ${PORT}`
  );

  startBot().catch((error) => {
    console.error(
      "Unable to start bot:",
      error.message
    );
  });
});
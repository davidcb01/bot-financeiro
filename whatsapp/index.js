// BOOT
console.log("BOT WHATSAPP INICIANDO...");

// REQUIRES
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const path = require("path");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

// Flow (Onde toda a mágica acontece)
const messageFlow = require("./flows/messageFlow");

// Estado em memória (Para cache rápido e limpeza de RAM)
const { estadoCliente } = require("./state/state");

// --- AJUSTE GLOBAL: meuPerfil declarado fora da função para persistência de escopo ---
let meuPerfil = { jid: null, nome: null };

//--------------------------------------
// PATCH LOGS: Limpa o terminal de erros irrelevantes do Baileys
//--------------------------------------
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
  const text = chunk?.toString?.() || "";
  if (
    text.includes("registrationId") ||
    text.includes("chainKey") ||
    text.includes("Bad MAC") ||
    text.includes("Failed to decrypt")
  )
    return true;
  return originalStdoutWrite(chunk, encoding, callback);
};

//--------------------------------------
// MAIN
//--------------------------------------
async function iniciarWhatsApp() {
  const { version, isLatest } = await fetchLatestBaileysVersion();

  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve(__dirname, "..", "auth_info"),
  );

  const sock = makeWASocket({
    version: [2, 3000, 1025190524],
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    browser: ["Windows", "Chrome", "Chrome 114.0.5735.198"],
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on("creds.update", saveCreds);

  //--------------------------------------
  // GESTÃO DE CONEXÃO
  //--------------------------------------
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n--- ESCANEIE O QR CODE ABAIXO ---");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : 0;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `Conexão fechada (${statusCode}). Reconectando: ${shouldReconnect}`,
      );

      if (shouldReconnect) {
        iniciarWhatsApp();
      } else {
        console.log("❌ SESSÃO ENCERRADA. Apague a pasta auth_info.");
      }
    }

    if (connection === "open") {
      // AJUSTE CRÍTICO: Captura os dados do bot logado JÁ LIMPOS (sem 55 e sem @s)
      let idLimpo = sock.user.id.split(":")[0];
      if (idLimpo.startsWith("55") && idLimpo.length > 10) {
        idLimpo = idLimpo.substring(2);
      }

      const userJid = idLimpo;

      // Captura o nome e limpa emojis para evitar erros no MySQL
      const userNome = (sock.user.name || "Financeiro IQ")
        .replace(/[^\x00-\x7F]/g, "")
        .trim();

      // Atualiza o objeto global que será lido pelo upsert de mensagens
      meuPerfil.jid = userJid;
      meuPerfil.nome = userNome;

      console.log(`✅ BOT CONECTADO COM SUCESSO: ${userNome} (${userJid})`);
    }
  });

  //--------------------------------------
  // TRATAMENTO DE MENSAGENS
  //--------------------------------------
  sock.ev.on("messages.upsert", async (data) => {
    try {
      // Delay de estabilidade para evitar erros de descriptografia (Bad MAC)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Enviamos o sock, os dados da mensagem e o meuPerfil global para o Flow
      await messageFlow(sock, data, meuPerfil);
    } catch (err) {
      if (!err.message.includes("Bad MAC")) {
        console.error("[ERRO FLOW]:", err);
      }
    }
  });

  //--------------------------------------
  // LIMPEZA DE CACHE (A cada 1 hora limpa inativos de 12h)
  //--------------------------------------
  setInterval(
    () => {
      const agora = Date.now();
      const DOZE_HORAS = 12 * 60 * 60 * 1000;

      estadoCliente.forEach((valor, chave) => {
        if (agora - (valor.lastActivity || 0) > DOZE_HORAS) {
          estadoCliente.delete(chave);
          console.log(`[LIMPEZA] Cache limpo para: ${chave}`);
        }
      });
    },
    60 * 60 * 1000,
  );
}

module.exports = iniciarWhatsApp;

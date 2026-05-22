const { obterEstado, salvarEstado } = require("../services/estadoService");
const { criarEstadoInicial } = require("../state/state");
const { estaNaBlacklist } = require("../services/blacklistService");
const {
  extrairTextoUniversal,
  normalizarJid,
  verificarComandosAdmin,
} = require("./flowUtils");
const { buscarClientePorJid } = require("../services/clienteService");
const delay = require("../utils/delay");

// IMPORTAÇÃO DOS ESTÁGIOS
const principalStage = require("./stages/principalStage");
const pinStage = require("./stages/pinStage");
const suporteStage = require("./stages/suporteStage");
const boletoStage = require("./stages/boletoStage");

// ==========================================
// AJUSTE DE TEMPO: 40 Minutos
// ==========================================
const TEMPO_INATIVIDADE = 40 * 60 * 1000;
const cacheMensagens = new Set();
const botStartTime = Date.now();

module.exports = async function messageFlow(
  sock,
  { messages, type },
  meuPerfilExterno, // Perfil vindo globalmente do index.js
) {
  const msg = messages?.[0];

  if (!msg || !msg.key || !msg.key.id) return;
  const msgId = msg.key.id;
  if (cacheMensagens.has(msgId)) return;
  cacheMensagens.add(msgId);
  setTimeout(() => cacheMensagens.delete(msgId), 10000);

  if (!msg.message || msg.messageStubType || type !== "notify") return;

  const idBruto = msg.key.remoteJid;
  if (
    idBruto.includes("@g.us") ||
    idBruto.includes("@broadcast") ||
    idBruto === "status@broadcast"
  )
    return;

  const timestampMsg = msg.messageTimestamp;
  if (Math.floor(Date.now() / 1000) - timestampMsg > 120) return;

  try {
    const jid = normalizarJid(idBruto);

    // AJUSTE CRÍTICO: normalizarJid abraçando tudo para blindar 100%
    const meuPerfil = {
      jid: normalizarJid(meuPerfilExterno?.jid || sock.user.id),
      nome: (meuPerfilExterno?.nome || sock.user.name || "Financeiro IQ")
        .replace(/[^\x00-\x7F]/g, "")
        .trim(),
    };

    const textoRaw = extrairTextoUniversal(msg);
    const msgTexto = (textoRaw || "").trim().toLowerCase();

    if (!msgTexto && !msg.message?.imageMessage && !msg.message?.videoMessage)
      return;

    const ehMinhaMsg = msg.key.fromMe === true;

    // --- GESTÃO DE ESTADO ---
    // Passamos o meuPerfil.jid para isolar o estado deste bot específico
    let estado = await obterEstado(jid, meuPerfil.jid);

    if (!estado) {
      estado = {
        ...criarEstadoInicial(),
        nome_perfil: msg.pushName || "Usuario",
      };
    }

    // Padronização de nome do cliente
    const nomeCru = msg.pushName || estado.nome_perfil || "Cliente";
    const nomeWhats = nomeCru.replace(/[^\x00-\x7F]/g, "").trim() || "Cliente";

    // Reconhecimento automático por JID
    if (!estado.id_cliente) {
      const dadosCliente = await buscarClientePorJid(jid);
      if (dadosCliente) {
        estado.id_cliente = dadosCliente.id_cliente;
      }
    }

    const agora = Date.now();

    // ==========================================
    // NOVA MATEMÁTICA DE EXPIRAÇÃO (40 MIN)
    // ==========================================
    if (estado.lastActivity) {
      const ultimaAtividade = Number(estado.lastActivity);
      const diferenca = agora - ultimaAtividade;
      if (
        agora - botStartTime > 2 * 60 * 1000 &&
        diferenca > TEMPO_INATIVIDADE
      ) {
        console.log(
          `[SESSÃO EXPIRADA FINANCEIRO] 40 min de inatividade. Resetando cliente: ${jid}`,
        );
        estado = {
          ...criarEstadoInicial(),
          nome_perfil: estado.nome_perfil,
          id_cliente: estado.id_cliente,
        };
      }
    }

    // AJUSTE CRÍTICO: O tempo atualiza com qualquer mensagem (Sua ou do Cliente)
    estado.lastActivity = agora;
    await salvarEstado(jid, estado, meuPerfil);

    // Argumentos padrão para os estágios
    const params = [
      sock,
      jid,
      msg,
      estado,
      msgTexto,
      idBruto,
      meuPerfil,
      nomeWhats,
    ];

    // COMANDOS ADMIN (#, #reset, #ignore)
    const admin = await verificarComandosAdmin(
      sock,
      idBruto,
      jid,
      msgTexto,
      ehMinhaMsg,
      estado,
      criarEstadoInicial,
      meuPerfil,
      msg,
    );
    if (admin && admin.stop) return;

    if (await estaNaBlacklist(jid)) return;

    // Se for minha mensagem e não for comando admin (capturado acima), encerra aqui para não processar fluxo como bot
    if (ehMinhaMsg) return;

    await delay(500, 1000);

    // --- ROTEAMENTO DE FLUXO ---

    // 1. SUPORTE HUMANO (Trava de atendimento)
    if (estado.menu === "SUPORTE" || estado.atendimentoHumano) {
      return await suporteStage(...params);
    }

    // 2. FLUXO DE PIN (Adicionado CONFIRMANDO_CACHED_PIN)
    const menusDePin = [
      "DIGITANDO_CNPJ_PIN",
      "POS_PIN",
      "CONFIRMANDO_CACHED_PIN",
    ];
    if (menusDePin.includes(estado.menu)) {
      return await pinStage(...params);
    }

    // 3. FLUXO DE BOLETO (Adicionado CONFIRMANDO_CACHED_FINANCEIRO)
    const menusFinanceiro = [
      "AGUARDANDO_CNPJ_FINANCEIRO",
      "POS_CONSULTA",
      "CONFIRMANDO_CACHED_FINANCEIRO",
    ];
    if (menusFinanceiro.includes(estado.menu)) {
      return await boletoStage(...params);
    }

    // 4. MENU PRINCIPAL / PRIMEIRA MENSAGEM
    if (!estado.jaRecebeuMenu || estado.menu === "PRINCIPAL") {
      return await principalStage(...params);
    }
  } catch (err) {
    if (
      !err.message.includes("Bad MAC") &&
      !err.message.includes("Stream error")
    ) {
      console.error("[ERRO FATAL NO FLOW FINANCEIRO]:", err);
    }
  }
};

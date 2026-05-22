const { salvarEstado } = require("../../services/estadoService");
const { criarEstadoInicial } = require("../../state/state");
const enviarMenuPrincipal = require("../../menus/principalMenu");
const { registrarInteracao } = require("../../services/interacaoService");
const { buscarClientePorJid } = require("../../services/clienteService");
const { mascararDocumento } = require("../flowUtils");

module.exports = async function principalStage(
  sock,
  jid,
  msg,
  estado,
  msgTexto,
  idBruto,
  meuPerfil,
) {
  const nomeCru = msg.pushName || estado.nome_perfil || "Cliente";
  const nomeWhats = nomeCru.replace(/[^\x00-\x7F]/g, "").trim() || "Cliente";

  if (msg.pushName && msg.pushName !== estado.nome_perfil) {
    estado.nome_perfil = nomeWhats;
  }

  if (estado.menu === "PRINCIPAL") {
    // OPÇÃO 1: GERAR PIN
    if (msgTexto === "1") {
      console.log(`[MENU] ${nomeWhats} acessou a opção de PIN.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "MENU_PIN",
        estado.id_cliente,
        meuPerfil,
      );

      const clienteCached = await buscarClientePorJid(jid);

      if (clienteCached && clienteCached.cnpj && clienteCached.cnpj !== "N/A") {
        estado.menu = "CONFIRMANDO_CACHED_PIN";
        await salvarEstado(jid, estado, meuPerfil);

        const cnpjMascarado = mascararDocumento(clienteCached.cnpj);
        const msgTextoCache = `Deseja consultar o PIN da empresa *${clienteCached.empresa}* (CNPJ: *${cnpjMascarado}*)?\n\n1️⃣ Sim\n2️⃣ Não, digitar outro CNPJ`;

        await sock.sendMessage(idBruto, { text: msgTextoCache });
        console.log(
          `[CACHE] Cliente reconhecido no PIN: ${clienteCached.empresa} (JID: ${jid})`,
        );
        return;
      }

      estado.menu = "DIGITANDO_CNPJ_PIN";
      await salvarEstado(jid, estado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "Por favor, informe o *CNPJ* da empresa (somente números) para gerar o PIN:",
      });
      return;
    }

    // OPÇÃO 2: BOLETO / PIX
    if (msgTexto === "2") {
      console.log(`[MENU] ${nomeWhats} acessou a opção de Financeiro.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "MENU_FINANCEIRO",
        estado.id_cliente,
        meuPerfil,
      );

      const clienteCached = await buscarClientePorJid(jid);

      if (clienteCached && clienteCached.cnpj && clienteCached.cnpj !== "N/A") {
        estado.menu = "CONFIRMANDO_CACHED_FINANCEIRO";
        await salvarEstado(jid, estado, meuPerfil);

        const docMascarado = mascararDocumento(clienteCached.cnpj);
        const msgTextoCache = `Deseja consultar boletos/Pix da empresa *${clienteCached.empresa}* (CNPJ: *${docMascarado}*)?\n\n1️⃣ Sim\n2️⃣ Não, digitar outro CNPJ`;
        await sock.sendMessage(idBruto, { text: msgTextoCache });
        console.log(
          `[CACHE] Cliente reconhecido no Financeiro: ${clienteCached.empresa} (JID: ${jid})`,
        );
        return;
      }

      estado.menu = "AGUARDANDO_CNPJ_FINANCEIRO";
      await salvarEstado(jid, estado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "Para consultar seus débitos, informe o seu *CNPJ* (somente números):",
      });
      return;
    }

    // OPÇÃO 3: SUPORTE HUMANO
    if (msgTexto === "3") {
      console.log(`[MENU] ${nomeWhats} solicitou Atendimento Humano.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "SUPORTE_HUMANO",
        estado.id_cliente,
        meuPerfil,
      );

      estado.atendimentoHumano = true;
      estado.menu = "SUPORTE";
      estado.humanoAtivadoEm = Date.now();
      await salvarEstado(jid, estado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "⏳ Informe a sua solicitação e em breve responderemos! OK?",
      });
      return;
    }

    // OPÇÃO 0: FINALIZAR
    if (msgTexto === "0") {
      console.log(
        `[MENU] ${nomeWhats} encerrou o atendimento no Menu Principal.`,
      );
      await registrarInteracao(
        jid,
        nomeWhats,
        "FINALIZAR_ATENDIMENTO",
        estado.id_cliente,
        meuPerfil,
      );

      const novoEstado = { ...criarEstadoInicial(), nome_perfil: nomeWhats };
      await salvarEstado(jid, novoEstado, meuPerfil);
      await sock.sendMessage(idBruto, { text: "✅ Atendimento finalizado!" });
      return;
    }

    estado.jaRecebeuMenu = true;
    await salvarEstado(jid, estado, meuPerfil);
    await enviarMenuPrincipal(sock, idBruto);
    return;
  }
};

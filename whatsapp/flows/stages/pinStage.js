const { salvarEstado } = require("../../services/estadoService");
const gerarPinLiberacao = require("../../services/pinService");
const delay = require("../../utils/delay");

// Serviços de banco de dados para auto-cadastro e logs
const {
  salvarCadastroCliente,
  buscarClientePorJid,
} = require("../../services/clienteService");
const {
  registrarInteracao,
  vincularInteracoesPendentes,
} = require("../../services/interacaoService");
const { registrarLogPin } = require("../../services/pinLogService");
const { criarEstadoInicial } = require("../../state/state");
const enviarMenuPrincipal = require("../../menus/principalMenu");

module.exports = async function pinStage(
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
  const suporteLimpo = meuPerfil.nome;

  if (msg.pushName && msg.pushName !== estado.nome_perfil) {
    estado.nome_perfil = nomeWhats;
  }

  if (estado.menu === "CONFIRMANDO_CACHED_PIN") {
    if (msgTexto === "1") {
      console.log(`[FLUXO PIN] ${nomeWhats} confirmou o uso do CNPJ salvo.`);
      // Busca direto do banco na hora, blindado contra erros:
      const cliente = await buscarClientePorJid(jid);
      const cnpjCached = cliente && cliente.cnpj ? cliente.cnpj : "";

      estado.menu = "DIGITANDO_CNPJ_PIN";
      return pinStage(sock, jid, msg, estado, cnpjCached, idBruto, meuPerfil);
    }

    if (msgTexto === "2") {
      console.log(`[FLUXO PIN] ${nomeWhats} vai digitar um novo CNPJ.`);
      estado.menu = "DIGITANDO_CNPJ_PIN";
      await salvarEstado(jid, estado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "Certo! Por favor, informe o *CNPJ* desejado (somente números):",
      });
      return;
    }

    await sock.sendMessage(idBruto, {
      text: "❌ Opção inválida.\n\nDigite *1* para Sim ou *2* para Não.",
    });
    return;
  }

  if (estado.menu === "DIGITANDO_CNPJ_PIN") {
    if (msgTexto === "9") {
      console.log(`[FLUXO PIN] ${nomeWhats} voltou ao menu principal.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "VOLTAR_PRINCIPAL_PIN",
        estado.id_cliente,
        meuPerfil,
      );
      estado.menu = "PRINCIPAL";
      estado.jaRecebeuMenu = true;
      await salvarEstado(jid, estado, meuPerfil);
      await enviarMenuPrincipal(sock, idBruto);
      return;
    }

    if (msgTexto === "0") {
      console.log(`[FLUXO PIN] ${nomeWhats} finalizou atendimento.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "FINALIZAR_PIN_INPUT",
        estado.id_cliente,
        meuPerfil,
      );
      const novoEstado = {
        ...criarEstadoInicial(),
        nome_perfil: nomeWhats,
        jaRecebeuMenu: false,
        menu: "PRINCIPAL",
      };
      await salvarEstado(jid, novoEstado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "✅ Atendimento finalizado. A IQ Sistemas agradece o contato!",
      });
      return;
    }

    // A MÁGICA CONTRA O ERRO: Transforma em string com segurança antes do replace
    const cnpjLimpo = String(msgTexto || "").replace(/\D/g, "");

    if (cnpjLimpo.length !== 14) {
      await sock.sendMessage(idBruto, {
        text: `❌ CNPJ incorreto. Digite novamente.\n\n9️⃣ Voltar ao menu principal\n0️⃣ Finalizar atendimento`,
      });
      return;
    }

    console.log(
      `[PIN STAGE] Iniciando requisição na API para o CNPJ: ${cnpjLimpo}`,
    );
    await delay(500, 800);
    await sock.sendMessage(idBruto, {
      text: "⏳ *Gerando PIN, aguarde um instante...*",
    });

    try {
      const pinTextoRaw = await gerarPinLiberacao(cnpjLimpo);

      const mensagemMatch = pinTextoRaw.match(/"mensagem":"([\s\S]*?)"\s*\}/);
      let pinExibicao = mensagemMatch ? mensagemMatch[1] : pinTextoRaw;

      try {
        pinExibicao = JSON.parse(`"${pinExibicao}"`);
      } catch (e) {}

      const idMatch = pinExibicao.match(/ID:\s*(\d+)/);
      const empresaMatch = pinExibicao.match(/Nome:\s*(.*?)\r?\n/);
      const validadeMatch = pinExibicao.match(
        /Validade:\s*(\d{2}\/\d{2}\/\d{4})/,
      );
      const pinNumeroMatch = pinExibicao.match(/PIN:\s*(\d+)/);

      const idExtraido = idMatch ? idMatch[1] : null;
      const nomeEmpresa = empresaMatch ? empresaMatch[1].trim() : "N/A";

      if (idExtraido) {
        estado.id_cliente = idExtraido;
        await salvarCadastroCliente(
          idExtraido,
          nomeEmpresa,
          cnpjLimpo,
          jid,
          nomeWhats,
          suporteLimpo,
        );
        await vincularInteracoesPendentes(jid, idExtraido);
        await registrarInteracao(
          jid,
          nomeWhats,
          "GEROU_PIN_SUCESSO",
          idExtraido,
          meuPerfil,
        );
      }

      await registrarLogPin(
        jid,
        nomeWhats,
        idExtraido,
        nomeEmpresa,
        cnpjLimpo,
        validadeMatch ? validadeMatch[1] : "N/A",
        pinNumeroMatch ? pinNumeroMatch[1] : "N/A",
        new Date().toISOString().split("T")[0],
        new Date().toLocaleTimeString("pt-BR", { hour12: false }),
        meuPerfil,
      );

      console.log(
        `[PIN STAGE] PIN gerado com sucesso para a empresa: ${nomeEmpresa}`,
      );
      await delay(500, 800);

      estado.menu = "POS_PIN";
      await salvarEstado(jid, estado, meuPerfil);

      await sock.sendMessage(idBruto, {
        text: `${pinExibicao}\n\nDeseja algo mais?\n1️⃣ Consultar outro CNPJ\n9️⃣ Voltar ao menu principal\n0️⃣ Finalizar atendimento`,
      });
    } catch (err) {
      console.error(`[ERRO PIN FINANCEIRO]: ${err.message}`);
      await sock.sendMessage(idBruto, {
        text: "❌ *Não foi possível gerar o PIN agora.* Tente novamente em instantes.",
      });
      estado.menu = "PRINCIPAL";
      await salvarEstado(jid, estado, meuPerfil);
    }
    return;
  }

  if (estado.menu === "POS_PIN") {
    if (msgTexto === "1") {
      console.log(`[FLUXO PIN] ${nomeWhats} escolheu consultar outro CNPJ.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "PIN_CONSULTAR_OUTRO",
        estado.id_cliente,
        meuPerfil,
      );
      estado.menu = "DIGITANDO_CNPJ_PIN";
      await salvarEstado(jid, estado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "Certo! Informe o novo *CNPJ* para consulta:",
      });
      return;
    }

    if (msgTexto === "9") {
      console.log(
        `[FLUXO PIN] ${nomeWhats} voltou ao menu principal no pós-consulta.`,
      );
      await registrarInteracao(
        jid,
        nomeWhats,
        "PIN_VOLTAR_PRINCIPAL",
        estado.id_cliente,
        meuPerfil,
      );
      estado.menu = "PRINCIPAL";
      estado.jaRecebeuMenu = true;
      await salvarEstado(jid, estado, meuPerfil);
      await enviarMenuPrincipal(sock, idBruto);
      return;
    }

    if (msgTexto === "0") {
      console.log(
        `[FLUXO PIN] ${nomeWhats} finalizou atendimento no pós-consulta.`,
      );
      await registrarInteracao(
        jid,
        nomeWhats,
        "PIN_FINALIZAR",
        estado.id_cliente,
        meuPerfil,
      );
      const novoEstado = {
        ...criarEstadoInicial(),
        nome_perfil: nomeWhats,
        id_cliente: estado.id_cliente,
      };
      await salvarEstado(jid, novoEstado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "✅ Atendimento finalizado. A IQ Sistemas agradece o contato!",
      });
      return;
    }
  }
};

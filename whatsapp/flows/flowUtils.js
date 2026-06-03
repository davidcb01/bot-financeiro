const { salvarEstado, obterEstado } = require("../services/estadoService");
const {
  adicionarNaBlacklist,
  removerDaBlacklist,
} = require("../services/blacklistService");
const { salvarCadastroCliente } = require("../services/clienteService");
const {
  obterResumoFinanceiro,
  obterResumoFinanceiroDetalhado,
} = require("../services/resumoService");

/**
 * Extrai texto de qualquer tipo de mensagem (Texto, legenda de imagem/vídeo, etc)
 */
function extrairTextoUniversal(msg) {
  if (!msg?.message) return "";
  if (msg.message.conversation) return msg.message.conversation;
  if (msg.message.extendedTextMessage?.text)
    return msg.message.extendedTextMessage.text;
  if (msg.message.imageMessage?.caption)
    return msg.message.imageMessage.caption || "__MIDIA__";
  if (msg.message.videoMessage?.caption)
    return msg.message.videoMessage.caption || "__MIDIA__";
  if (
    msg.message.audioMessage ||
    msg.message.stickerMessage ||
    msg.message.imageMessage ||
    msg.message.videoMessage
  )
    return "__MIDIA__";
  return "";
}

/**
 * Normaliza o JID garantindo o sufixo @s.whatsapp.net e removendo dispositivos/DDI
 */
function normalizarJid(jid) {
  if (!jid) return "";
  let idLimpo = jid.split("@")[0].split(":")[0];
  if (jid.includes("@lid")) return idLimpo + "@lid";
  if (idLimpo.startsWith("55") && idLimpo.length > 10)
    idLimpo = idLimpo.substring(2);
  return idLimpo;
}

/**
 * Aplica máscara de privacidade em CNPJ ou CPF para exibição
 */
function mascararDocumento(documento) {
  if (!documento || documento === "N/A") return "Não cadastrado";

  const doc = documento.replace(/\D/g, "");

  // Exclusivo para CNPJ (14 dígitos)
  if (doc.length === 14) {
    return `${doc.substring(0, 2)}.${doc.substring(2, 5)}.XXX/XXXX-${doc.substring(12, 14)}`;
  }

  // Se vier com tamanho diferente de 14, retorna do jeito que está, sem formatar
  return documento;
}

/**
 * Gerencia comandos executados por VOCÊ (admin) diretamente no chat do cliente
 */
async function verificarComandosAdmin(
  sock,
  idBruto,
  jid,
  msgTexto,
  ehMinhaMsg,
  estado,
  criarEstadoInicial,
  meuPerfil,
  msg,
) {
  if (ehMinhaMsg) {
    // --- #ADD (Cadastro manual de cliente no SICE) ---
    if (msgTexto.startsWith("#add")) {
      const partes = msgTexto.split(" ");
      const idSice = partes[partes.length - 2]; // Penúltimo é o ID
      const nomeEmpresa = partes.slice(1, partes.length - 2).join(" "); // No meio é o nome

      if (idSice && nomeEmpresa) {
        try {
          await salvarCadastroCliente(
            idSice,
            nomeEmpresa,
            "N/A",
            jid,
            estado.nome_perfil || "Usuario",
            meuPerfil.nome,
          );

          estado.id_cliente = idSice;
          await salvarEstado(jid, estado, meuPerfil);

          await sock.sendMessage(idBruto, {
            react: { text: "✅", key: msg.key },
          });

          setTimeout(async () => {
            try {
              await sock.sendMessage(idBruto, { delete: msg.key });
            } catch (e) {}
          }, 2000);

          console.log(
            `[CADASTRO MANUAL] ${nomeEmpresa} vinculado ao JID ${jid}`,
          );
        } catch (err) {
          console.error("[ERRO NO #ADD]:", err);
        }
        return { stop: true };
      }
    }

    // --- #IGNORE (Adiciona na Blacklist) ---
    if (msgTexto.startsWith("#ignore")) {
      const partes = msgTexto.split(" ");

      // AJUSTE: Normaliza o chat atual caso ele seja o alvo
      let jidAlvo = normalizarJid(idBruto);

      // AJUSTE: Normaliza o número extra caso o usuário tenha digitado um
      if (partes[1]) {
        jidAlvo = normalizarJid(partes[1]);
      }

      // Tenta buscar o nome do alvo no banco para o log ficar bonito
      const estadoAlvo = await obterEstado(jidAlvo, meuPerfil.jid);
      const nomeAlvo = estadoAlvo?.nome_perfil || "Cliente";

      await adicionarNaBlacklist(
        jidAlvo,
        nomeAlvo,
        `Bloqueado por ${meuPerfil.nome}`,
      );

      await sock.sendMessage(idBruto, {
        text: `🚫 ${nomeAlvo} (${jidAlvo}) ignorado no Financeiro.`,
      });
      return { stop: true };
    }

    // --- #UNIGNORE (Remove da Blacklist) ---
    if (msgTexto.startsWith("#unignore")) {
      const partes = msgTexto.split(" ");

      // AJUSTE: Segue a mesma lógica do ignore, limpando tudo
      let jidAlvo = normalizarJid(idBruto);

      if (partes[1]) {
        jidAlvo = normalizarJid(partes[1]);
      }

      await removerDaBlacklist(jidAlvo);
      await sock.sendMessage(idBruto, {
        text: `✅ ID ${jidAlvo} liberado no Financeiro.`,
      });
      return { stop: true };
    }

    // --- #RESUMO INDIVIDUAL FINANCEIRO ---
    if (msgTexto === "#resumo") {
      try {
        const dadosResumo = await obterResumoFinanceiro(meuPerfil.jid);

        if (dadosResumo) {
          const msgResumo =
            `📊 *RESUMO DIÁRIO FINANCEIRO - ${meuPerfil.nome}*\n\n` +
            `📄 Boletos/Pix Emitidos Hoje: *${dadosResumo.boletos}*\n` +
            `🔑 PINs Gerados Hoje: *${dadosResumo.pins}*\n` +
            `⏳ Atendimentos Ativos Agora: *${dadosResumo.humanosAtivos}*\n` +
            `💬 Total de Interações Hoje: *${dadosResumo.interacoes}*`;

          await sock.sendMessage(idBruto, { text: msgResumo });
          console.log(
            `[COMANDO] Relatório financeiro emitido com sucesso para ${meuPerfil.nome}`,
          );
        } else {
          await sock.sendMessage(idBruto, {
            text: "⚠️ Não foi possível coletar seus dados de resumo financeiro hoje.",
          });
        }
      } catch (err) {
        console.error("[ERRO NO #RESUMO FINANCEIRO]:", err);
        await sock.sendMessage(idBruto, {
          text: "❌ Erro ao processar o comando de resumo financeiro.",
        });
      }
      return { stop: true };
    }

    // --- #RESUMO DETALHADO FINANCEIRO ---
    if (msgTexto === "#resumodet") {
      try {
        const dados = await obterResumoFinanceiroDetalhado(meuPerfil.jid);

        if (dados) {
          // Formata as linhas trazendo o ID do SICE ocultando strings de servidor e emojis redundantes
          const formatarLinha = (item) => {
            const idCli =
              item.id_cliente && item.id_cliente !== "NULL"
                ? item.id_cliente
                : "N/A";
            return `  └ [ID: ${idCli}] *${item.nome}*`;
          };

          const listaBoletos =
            dados.boletosLista.length > 0
              ? dados.boletosLista.map(formatarLinha).join("\n")
              : "  └ _Nenhum_";
          const listaPins =
            dados.pinsLista.length > 0
              ? dados.pinsLista.map(formatarLinha).join("\n")
              : "  └ _Nenhum_";
          const listaAtivos =
            dados.ativosLista.length > 0
              ? dados.ativosLista.map(formatarLinha).join("\n")
              : "  └ _Nenhum_";

          const msgResumo =
            `📊 *RESUMO DETALHADO FINANCEIRO - ${meuPerfil.nome}*\n\n` +
            `📄 Boletos/Pix Emitidos Hoje: *${dados.boletosLista.length}*\n${listaBoletos}\n\n` +
            `🔑 PINs Gerados Hoje: *${dados.pinsLista.length}*\n${listaPins}\n\n` +
            `⏳ Atendimentos Ativos Agora: *${dados.ativosLista.length}*\n${listaAtivos}\n\n` +
            `💬 Total de Interações Hoje: *${dados.interacoesTotal}*`;

          await sock.sendMessage(idBruto, { text: msgResumo });
          console.log(
            `[COMANDO] Relatório detalhado financeiro emitido com sucesso para ${meuPerfil.nome}`,
          );
        } else {
          await sock.sendMessage(idBruto, {
            text: "⚠️ Não foi possível coletar seus dados detalhados financeiros hoje.",
          });
        }
      } catch (err) {
        console.error("[ERRO NO #RESUMODET FINANCEIRO]:", err);
        await sock.sendMessage(idBruto, {
          text: "❌ Erro ao processar o comando de resumo detalhado financeiro.",
        });
      }
      return { stop: true };
    }

    // --- # ou #RESET (Reseta o menu para o cliente) ---
    if (msgTexto === "#" || msgTexto === "#reset") {
      const novoEstado = {
        ...criarEstadoInicial(),
        jaRecebeuMenu: msgTexto !== "#", // Se for só # ele mostra o menu de novo
        nome_perfil: estado.nome_perfil,
        id_cliente: estado.id_cliente,
      };

      await salvarEstado(jid, novoEstado, meuPerfil);
      // Feedback visual igual ao principal
      console.log(`[COMANDO] Reset de menu efetuado para ${jid}`);
      return { stop: true };
    }

    // --- TRAVA DO HUMANO ---
    // Se você digitar qualquer coisa que não comece com #, o bot entra em modo suporte
    if (!msgTexto.startsWith("#")) {
      estado.atendimentoHumano = true;
      estado.menu = "SUPORTE";
      estado.humanoAtivadoEm = Date.now();
      await salvarEstado(jid, estado, meuPerfil);
      console.log(`[MODO HUMANO] Financeiro ativado para ${jid}`);
      return { stop: true };
    }
  }

  // Se já estiver em suporte ou atendimento humano, interrompe o fluxo automático
  if (estado.menu === "SUPORTE" || estado.atendimentoHumano) {
    return { stop: true };
  }

  return { stop: false };
}

module.exports = {
  extrairTextoUniversal,
  normalizarJid,
  verificarComandosAdmin,
  mascararDocumento,
};

const { salvarEstado } = require("../../services/estadoService");
const { criarEstadoInicial } = require("../../state/state");
const {
  consultarDebitos,
  consultarBase64,
  consultarChavePIX,
} = require("../../services/boletoService");
const enviarMenuPrincipal = require("../../menus/principalMenu");
const enviarMenuFinanceiro = require("../../menus/financeiroMenu");
const {
  registrarInteracao,
  vincularInteracoesPendentes,
} = require("../../services/interacaoService");
const { registrarLogBoleto } = require("../../services/boletoLogService");
const {
  salvarCadastroCliente,
  buscarClientePorJid,
} = require("../../services/clienteService");

module.exports = async function boletoStage(
  sock,
  jid,
  msg,
  estado,
  msgTexto,
  idBruto,
  meuPerfil,
  nomeWhats,
) {
  if (estado.menu === "CONFIRMANDO_CACHED_FINANCEIRO") {
    if (msgTexto === "1") {
      console.log(
        `[FLUXO FINANCEIRO] ${nomeWhats} confirmou o uso do documento salvo.`,
      );
      const cliente = await buscarClientePorJid(jid);
      const docCached = cliente && cliente.cnpj ? cliente.cnpj : "";

      estado.menu = "AGUARDANDO_CNPJ_FINANCEIRO";
      return boletoStage(
        sock,
        jid,
        msg,
        estado,
        docCached,
        idBruto,
        meuPerfil,
        nomeWhats,
      );
    }

    if (msgTexto === "2") {
      console.log(`[FLUXO FINANCEIRO] ${nomeWhats} negou o documento salvo.`);
      estado.menu = "AGUARDANDO_CNPJ_FINANCEIRO";
      await salvarEstado(jid, estado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "Certo! Informe o novo *CNPJ* para consulta (somente números):",
      });
      return;
    }

    await sock.sendMessage(idBruto, {
      text: "❌ Opção inválida.\n\nDigite *1* para Sim ou *2* para Não.",
    });
    return;
  }

  if (estado.menu === "AGUARDANDO_CNPJ_FINANCEIRO") {
    if (msgTexto === "9") {
      console.log(`[FLUXO FINANCEIRO] ${nomeWhats} voltou ao menu principal.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "VOLTAR_PRINCIPAL_FIN",
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
      console.log(`[FLUXO FINANCEIRO] ${nomeWhats} finalizou o atendimento.`);
      await registrarInteracao(
        jid,
        nomeWhats,
        "FINALIZAR_FIN",
        estado.id_cliente,
        meuPerfil,
      );
      const novoEstado = { ...criarEstadoInicial(), nome_perfil: nomeWhats };
      await salvarEstado(jid, novoEstado, meuPerfil);
      await sock.sendMessage(idBruto, { text: "✅ Atendimento finalizado!" });
      return;
    }

    // A MÁGICA CONTRA O ERRO: Transforma em string com segurança antes do replace
    const cnpjLimpo = String(msgTexto || "").replace(/\D/g, "");

    if (cnpjLimpo.length !== 11 && cnpjLimpo.length !== 14) {
      await sock.sendMessage(idBruto, {
        text: "❌ CNPJ incorreto. Por favor, digite novamente.\n\n9️⃣ Voltar ao menu principal\n0️⃣ Finalizar atendimento",
      });
      return;
    }

    console.log(`[BOLETO STAGE] Consultando API SICE para o doc: ${cnpjLimpo}`);
    await sock.sendMessage(idBruto, {
      text: "🔍 Consultando faturas, aguarde um instante...",
    });

    try {
      const resultado = await consultarDebitos(cnpjLimpo);

      if (resultado === null) {
        await sock.sendMessage(idBruto, {
          text: "❌ Erro na consulta automática. Por favor, fale com nosso financeiro: (87) 99991-4118",
        });
      } else if (
        typeof resultado === "string" &&
        resultado.includes("JVBERi")
      ) {
        console.log(`[BOLETO STAGE] Fatura única localizada. Enviando PDF.`);
        await sock.sendMessage(idBruto, {
          text: "✅ Boleto localizado! Enviando arquivo boletos(PDF)...",
        });
        await sock.sendMessage(idBruto, {
          document: Buffer.from(resultado, "base64"),
          mimetype: "application/pdf",
          fileName: `Boleto_${cnpjLimpo}.pdf`,
        });
      } else {
        let parcelas = [];
        try {
          parcelas =
            typeof resultado === "string" ? JSON.parse(resultado) : resultado;
        } catch (e) {
          parcelas = Array.isArray(resultado) ? resultado : [];
        }

        if (Array.isArray(parcelas) && parcelas.length > 0) {
          console.log("=== DADOS QUE VIERAM DA API ===", parcelas[0]);

          const idExtraido = parcelas[0].codigo;
          estado.id_cliente = idExtraido;
          const nomeEmpresa =
            parcelas[0].nome ||
            parcelas[0].razao ||
            parcelas[0].empresa ||
            nomeWhats;

          try {
            await salvarCadastroCliente(
              idExtraido,
              nomeEmpresa,
              cnpjLimpo,
              jid,
              nomeWhats,
              meuPerfil.nome || "Financeiro IQ",
            );
            console.log(
              `[AUTO CADASTRO FINANCEIRO] ${nomeEmpresa} vinculado ao JID ${jid}`,
            );
          } catch (cadastroErr) {
            console.error(
              "❌ [ERRO AUTO CADASTRO]: Falha ao salvar cliente, mas o fluxo continua.",
              cadastroErr.message,
            );
          }

          const valorTotal = parcelas.reduce(
            (acc, f) => acc + (f.valor || 0),
            0,
          );
          const qtdFaturas = parcelas.length;

          await registrarLogBoleto(
            jid,
            nomeWhats,
            idExtraido,
            cnpjLimpo,
            qtdFaturas,
            valorTotal,
            meuPerfil,
          );
          await vincularInteracoesPendentes(jid, idExtraido);
          await registrarInteracao(
            jid,
            nomeWhats,
            "LISTOU_FATURAS",
            idExtraido,
            meuPerfil,
          );

          console.log(
            `[BOLETO STAGE] ${parcelas.length} faturas listadas para a empresa ${nomeEmpresa}.`,
          );
          await sock.sendMessage(idBruto, {
            text: `✅ Localizei ${parcelas.length} fatura(s). Vou gerar os boletos(PDF) e chaves PIX para você, aguarde...`,
          });

          for (const [index, fatura] of parcelas.entries()) {
            console.log(
              `[BOLETO STAGE] Processando Parcela ${index + 1}: Seq ${fatura.sequenciainc}`,
            );
            const pdfBase64 = await consultarBase64(
              cnpjLimpo,
              fatura.sequenciainc,
            );
            const pixCopiaCola = await consultarChavePIX(
              fatura.codigo,
              fatura.sequenciainc,
            );
            const dataVenc = fatura.vencimento
              .split("T")[0]
              .split("-")
              .reverse()
              .join("/");

            await sock.sendMessage(idBruto, {
              text: `📄 *PARCELA ${index + 1}* - Vencimento: ${dataVenc} | Valor: R$ ${fatura.valor.toFixed(2)}`,
            });

            if (pdfBase64 && pdfBase64.includes("JVBERi")) {
              await sock.sendMessage(idBruto, {
                document: Buffer.from(pdfBase64, "base64"),
                mimetype: "application/pdf",
                fileName: `Boleto_Venc_${dataVenc.replace(/\//g, "-")}.pdf`,
              });
            } else {
              console.log(
                `[AVISO] PDF não gerado para Seq: ${fatura.sequenciainc}.`,
              );
            }

            if (pixCopiaCola && pixCopiaCola.length > 10) {
              await sock.sendMessage(idBruto, {
                text: `👇 *Chave PIX Copia e Cola (Parcela ${index + 1}):*`,
              });
              await sock.sendMessage(idBruto, { text: pixCopiaCola });
            }
            await new Promise((res) => setTimeout(res, 500));
          }
        } else {
          console.log(
            `[BOLETO STAGE] Nenhuma pendência encontrada para o doc ${cnpjLimpo}.`,
          );
          await sock.sendMessage(idBruto, {
            text: "✅ Nada consta para este CNPJ no momento. Tudo em dia!",
          });
        }
      }
    } catch (error) {
      console.error("[ERRO BOLETO STAGE]:", error);
      await sock.sendMessage(idBruto, {
        text: "❌ Tive um problema técnico na consulta.",
      });
    }

    estado.menu = "POS_CONSULTA";
    await salvarEstado(jid, estado, meuPerfil);
    await enviarMenuFinanceiro(sock, idBruto);
    return;
  }

  if (estado.menu === "POS_CONSULTA") {
    if (msgTexto === "1") {
      console.log(
        `[FLUXO FINANCEIRO] ${nomeWhats} escolheu consultar outro documento.`,
      );
      await registrarInteracao(
        jid,
        nomeWhats,
        "CONSULTAR_OUTRO_CNPJ",
        estado.id_cliente,
        meuPerfil,
      );
      estado.menu = "AGUARDANDO_CNPJ_FINANCEIRO";
      await salvarEstado(jid, estado, meuPerfil);
      await sock.sendMessage(idBruto, {
        text: "Informe o novo *CNPJ* para consulta:",
      });
      return;
    }

    if (msgTexto === "9") {
      console.log(
        `[FLUXO FINANCEIRO] ${nomeWhats} voltou ao menu principal no pós-consulta.`,
      );
      await registrarInteracao(
        jid,
        nomeWhats,
        "VOLTAR_PRINCIPAL_POS",
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
        `[FLUXO FINANCEIRO] ${nomeWhats} encerrou o atendimento no pós-consulta.`,
      );
      await registrarInteracao(
        jid,
        nomeWhats,
        "FINALIZAR_POS",
        estado.id_cliente,
        meuPerfil,
      );
      const novoEstado = { ...criarEstadoInicial(), nome_perfil: nomeWhats };
      await salvarEstado(jid, novoEstado, meuPerfil);
      await sock.sendMessage(idBruto, { text: "✅ Atendimento finalizado!" });
      return;
    }

    const cnpjTentativa = String(msgTexto || "").replace(/\D/g, "");
    if (cnpjTentativa.length > 0) {
      if (cnpjTentativa.length !== 11 && cnpjTentativa.length !== 14) {
        await sock.sendMessage(idBruto, {
          text: "❌ CNPJ incorreto. Por favor, digite novamente.\n\n9️⃣ Voltar ao menu principal\n0️⃣ Finalizar atendimento",
        });
        return;
      } else {
        await registrarInteracao(
          jid,
          nomeWhats,
          "CNPJ_DIRETO_POS",
          estado.id_cliente,
          meuPerfil,
        );
        estado.menu = "AGUARDANDO_CNPJ_FINANCEIRO";
        await salvarEstado(jid, estado, meuPerfil);
        return boletoStage(
          sock,
          jid,
          msg,
          estado,
          msgTexto,
          idBruto,
          meuPerfil,
          nomeWhats,
        );
      }
    }
  }
};

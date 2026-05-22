const pool = require("./database");

/**
 * Registra uma nova interação (clique em botão/menu) no banco de dados.
 * Agora inclui os campos jid_suporte e nome_suporte para auditoria.
 */
async function registrarInteracao(
  jid,
  nome,
  opcao,
  idCliente = null,
  meuPerfil = {},
) {
  const agora = new Date();

  // Formata a data para AAAA-MM-DD e a hora para HH:MM:SS
  const data = agora.toISOString().split("T")[0];
  const hora = agora.toTimeString().split(" ")[0];

  // Limpa emojis do nome do cliente (Segurança para o MySQL)
  const nomeLimpo = nome.replace(/[^\x00-\x7F]/g, "").trim() || "Usuario";

  // AJUSTE DE BLINDAGEM: Garante que o nome do suporte seja o dinâmico ou o padrão do Financeiro
  const suporteNomeFinal =
    meuPerfil.nome && meuPerfil.nome !== "Bot IQ Sistemas"
      ? meuPerfil.nome
      : "Financeiro IQ";

  const suporteJid = meuPerfil.jid || "SISTEMA";

  // SQL atualizado com as duas novas colunas de suporte
  const sql =
    "INSERT INTO interacoes (jid, nome_perfil, id_cliente, opcao_escolhida, data, hora, jid_suporte, nome_suporte) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

  try {
    await pool.execute(sql, [
      jid,
      nomeLimpo,
      idCliente,
      opcao,
      data,
      hora,
      suporteJid, // JID do bot ( Financeiro ou Suporte)
      suporteNomeFinal, // Nome dinâmico capturado no index.js
    ]);
  } catch (err) {
    console.error("[ERRO INTERACAO]:", err);
  }
}

/**
 * Busca interações feitas HOJE que estão sem ID de cliente e as vincula ao ID descoberto.
 */
async function vincularInteracoesPendentes(jid, idCliente) {
  // Ajuste para pegar a data correta no fuso de Pernambuco (sv-SE gera AAAA-MM-DD)
  const dataHoje = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Recife" })
    .split(" ")[0];

  const sql = `
    UPDATE interacoes 
    SET id_cliente = ? 
    WHERE jid = ? AND id_cliente IS NULL AND data = ?
  `;

  try {
    const [result] = await pool.execute(sql, [idCliente, jid, dataHoje]);

    if (result.affectedRows > 0) {
      console.log(
        `[DATABASE] ${result.affectedRows} interações retroativas vinculadas ao ID ${idCliente}`,
      );
    }
  } catch (err) {
    console.error("[ERRO VINCULAR INTERACOES]:", err);
  }
}

module.exports = { registrarInteracao, vincularInteracoesPendentes };

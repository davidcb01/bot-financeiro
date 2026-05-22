const pool = require("./database");

/**
 * Busca os dados da empresa vinculada a um JID específico.
 */
async function buscarClientePorJid(jid) {
  const sql =
    "SELECT id_cliente, empresa, cnpj FROM clientes WHERE jid = ? LIMIT 1";
  try {
    const [rows] = await pool.execute(sql, [jid]);
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error("[ERRO BUSCAR CLIENTE]:", err);
    return null;
  }
}

/**
 * Cadastra ou atualiza o vínculo de um JID com uma empresa/ID SICE.
 * Mantém a lógica de CNPJ que é exclusiva do Bot Financeiro.
 */
async function salvarCadastroCliente(
  id_cliente,
  empresa,
  cnpj,
  jid,
  nome_perfil,
  nome_suporte,
) {
  // 1. Limpeza do nome do cliente (Segurança contra erro de Emoji)
  const nomeClienteLimpo = (nome_perfil || "Cliente")
    .replace(/[^\x00-\x7F]/g, "")
    .trim();

  // 2. Blindagem do nome do suporte (Garante que não grave "Bot IQ Sistemas")
  const suporteNomeFinal =
    nome_suporte && nome_suporte !== "Bot IQ Sistemas"
      ? nome_suporte
      : "Financeiro IQ";

  const sql = `
    INSERT INTO clientes (id_cliente, empresa, cnpj, jid, nome_perfil, nome_suporte, data, hora)
    VALUES (?, ?, ?, ?, ?, ?, CURDATE(), CURTIME())
    ON DUPLICATE KEY UPDATE
    id_cliente = VALUES(id_cliente),
    empresa = VALUES(empresa),
    cnpj = VALUES(cnpj), 
    nome_perfil = VALUES(nome_perfil),
    nome_suporte = VALUES(nome_suporte),
    data = CURDATE(),
    hora = CURTIME();
  `;

  try {
    await pool.execute(sql, [
      id_cliente,
      empresa,
      cnpj, // Mantendo o CNPJ que você adicionou
      jid,
      nomeClienteLimpo, // Nome do cliente sem emojis
      suporteNomeFinal, // Nome do suporte blindado
    ]);
  } catch (err) {
    console.error("[ERRO CADASTRAR CLIENTE]:", err);
    throw err;
  }
}

module.exports = { buscarClientePorJid, salvarCadastroCliente };

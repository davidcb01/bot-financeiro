const pool = require("./database");

/**
 * Verifica se um JID está na lista de bloqueio.
 */
async function estaNaBlacklist(jid) {
  if (!jid) return false;
  const [rows] = await pool.execute("SELECT jid FROM blacklist WHERE jid = ?", [
    jid,
  ]);
  return rows.length > 0;
}

/**
 * Adiciona um usuário à blacklist.
 * O 'nome' aqui é o nome do cliente, e o 'motivo' conterá quem bloqueou.
 */
async function adicionarNaBlacklist(jid, nome, motivo = "Bloqueio manual") {
  // AJUSTE: Garantindo que a data do bloqueio siga o fuso de Pernambuco
  const agora = new Date();

  // Formato AAAA-MM-DD
  const data = agora
    .toLocaleString("sv-SE", { timeZone: "America/Recife" })
    .split(" ")[0];
  // Formato HH:MM:SS
  const hora = agora
    .toLocaleString("sv-SE", { timeZone: "America/Recife" })
    .split(" ")[1];

  // Limpeza do nome do cliente para evitar erro de caractere especial no MySQL
  const nomeLimpo = (nome || "Cliente").replace(/[^\x00-\x7F]/g, "").trim();

  const sql = `
        INSERT INTO blacklist (jid, nome_perfil, motivo, data, hora) 
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        nome_perfil = VALUES(nome_perfil),
        motivo = VALUES(motivo),
        data = VALUES(data),
        hora = VALUES(hora)
    `;

  try {
    await pool.execute(sql, [jid, nomeLimpo, motivo, data, hora]);
    console.log(`[BLACKLIST] ID ${jid} adicionado à lista negra.`);
  } catch (err) {
    console.error("[ERRO AO ADICIONAR BLACKLIST]:", err);
  }
}

/**
 * Remove um usuário da blacklist.
 */
async function removerDaBlacklist(jid) {
  const sql = "DELETE FROM blacklist WHERE jid = ?";
  try {
    await pool.execute(sql, [jid]);
    console.log(`[BLACKLIST] ID ${jid} removido da lista negra.`);
  } catch (err) {
    console.error("[ERRO AO REMOVER DA BLACKLIST]:", err);
  }
}

module.exports = { estaNaBlacklist, adicionarNaBlacklist, removerDaBlacklist };

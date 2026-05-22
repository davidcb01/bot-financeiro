const pool = require("./database");

/**
 * Busca o estado do cliente FILTRANDO pelo JID do bot (meuJid).
 * Isso permite que o mesmo cliente fale com o Financeiro e o Suporte ao mesmo tempo
 * sem que um bot resete o menu do outro.
 */
async function obterEstado(jid, meuJid) {
  // PROTEÇÃO: Se jid for nulo ou meuJid for undefined, evita o erro de bind no SQL
  if (!jid) return null;
  const botJid = meuJid || "SISTEMA";

  const [rows] = await pool.execute(
    "SELECT * FROM estado WHERE jid = ? AND jid_suporte = ?",
    [jid, botJid],
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      ...row,
      id_cliente: row.id_cliente,
      jaRecebeuMenu: !!row.jaRecebeuMenu,
      atendimentoHumano: !!row.atendimentoHumano,
      lastActivity: row.lastActivity ? Number(row.lastActivity) : null,
      humanoAtivadoEm: row.humanoAtivadoEm ? Number(row.humanoAtivadoEm) : null,
    };
  }
  return null;
}

/**
 * Salva o estado atual do cliente.
 */
async function salvarEstado(jid, estado, meuPerfil = {}) {
  // Limpeza de nome do cliente (Remover emojis para o MySQL)
  const nomeLimpo = (estado.nome_perfil || "Usuario")
    .replace(/[^\x00-\x7F]/g, "")
    .trim();

  // Garante que o JID do bot seja gravado para manter a separação das conversas
  const meuJid = meuPerfil.jid || "SISTEMA";

  // AJUSTE CRÍTICO: Fallback para o nome do suporte.
  // Se o nome vier "Bot IQ Sistemas" ou vazio, ele usa o padrão "Financeiro IQ"
  // Isso resolve o problema de gravar o nome errado no banco.
  const nomeSuporteFinal =
    meuPerfil.nome && meuPerfil.nome !== "Bot IQ Sistemas"
      ? meuPerfil.nome
      : "Financeiro IQ";

  const sql = `
        INSERT INTO estado (
            jid, nome_perfil, id_cliente, menu, jaRecebeuMenu, 
            atendimentoHumano, humanoAtivadoEm, lastActivity, 
            lastActivitydatetime, jid_suporte, nome_suporte
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        nome_perfil = VALUES(nome_perfil),
        id_cliente = VALUES(id_cliente),
        menu = VALUES(menu),
        jaRecebeuMenu = VALUES(jaRecebeuMenu),
        atendimentoHumano = VALUES(atendimentoHumano),
        humanoAtivadoEm = VALUES(humanoAtivadoEm),
        lastActivity = VALUES(lastActivity),
        lastActivitydatetime = VALUES(lastActivitydatetime),
        nome_suporte = VALUES(nome_suporte);
    `;

  const dataLocalRelatorio = estado.lastActivity
    ? new Date(Number(estado.lastActivity)).toLocaleString("sv-SE", {
        timeZone: "America/Recife",
      })
    : new Date().toLocaleString("sv-SE", { timeZone: "America/Recife" });

  const values = [
    jid,
    nomeLimpo,
    estado.id_cliente || null,
    estado.menu || "PRINCIPAL",
    estado.jaRecebeuMenu ? 1 : 0,
    estado.atendimentoHumano ? 1 : 0,
    estado.humanoAtivadoEm ? Number(estado.humanoAtivadoEm) : null,
    estado.lastActivity ? Number(estado.lastActivity) : null,
    dataLocalRelatorio,
    meuJid,
    nomeSuporteFinal, // <--- Usando a variável tratada
  ];

  try {
    await pool.execute(sql, values);
  } catch (err) {
    console.error("[ERRO SALVAR ESTADO]:", err);
  }
}

module.exports = { obterEstado, salvarEstado };

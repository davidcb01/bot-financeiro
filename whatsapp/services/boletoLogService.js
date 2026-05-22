const pool = require("./database");

/**
 * Registra o log de consulta de boletos no banco de dados.
 * Baseado na lógica do pinLogService, mas focado em faturas.
 */
async function registrarLogBoleto(
  jid,
  solicitante,
  id_cli,
  cnpj,
  qtd_faturas,
  valor_total,
  meuPerfil = {},
) {
  const agora = new Date();

  // Captura Data e Hora no fuso de Pernambuco
  const data = agora
    .toLocaleString("sv-SE", { timeZone: "America/Recife" })
    .split(" ")[0];
  const hora = agora
    .toLocaleString("sv-SE", { timeZone: "America/Recife" })
    .split(" ")[1];

  const sql = `INSERT INTO consultasboleto 
    (jid_solicitante, nome_solicitante, id_cliente, cnpj_consultado, quantidade_faturas, valor_total, data, hora, jid_suporte, nome_suporte) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  try {
    await pool.execute(sql, [
      jid,
      solicitante,
      id_cli,
      cnpj,
      qtd_faturas,
      valor_total,
      data,
      hora,
      meuPerfil.jid || null,
      meuPerfil.nome || "Financeiro IQ",
    ]);
    console.log(
      `[LOG BOLETO] Consulta de ${solicitante} registrada com sucesso.`,
    );
  } catch (err) {
    // Apenas logamos o erro para não travar o bot se o banco falhar
    console.error(
      "❌ [ERRO BANCO BOLETO]: Falha ao gravar log de consulta.",
      err.message,
    );
  }
}

module.exports = { registrarLogBoleto };

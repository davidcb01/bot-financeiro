const pool = require("./database");

/**
 * Registra o log de geração de PIN no banco de dados.
 * Agora inclui jid_suporte e nome_suporte para identificar qual bot/técnico gerou o PIN.
 */
async function registrarLogPin(
  jid,
  solicitante,
  id_cli,
  razao,
  cnpj,
  validade,
  pin,
  data,
  hora,
  meuPerfil = {}, // Adicionado parâmetro para seus dados técnicos
) {
  // SQL atualizado com as duas novas colunas no final
  const sql = `INSERT INTO consultaspin 
    (jid_solicitante, nome_solicitante, id_cliente, razaosocial, cnpj, validade, pin, data, hora, jid_suporte, nome_suporte) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  try {
    await pool.execute(sql, [
      jid,
      solicitante,
      id_cli,
      razao,
      cnpj,
      validade,
      pin,
      data,
      hora,
      meuPerfil.jid || null, // Sua LID/JID (técnico)
      meuPerfil.nome || null, // Seu Nome (técnico)
    ]);
  } catch (err) {
    // Loga o erro no console para saber que o banco falhou,
    // não dá um "throw err", assim o Flow continua o fluxo.
    console.error(
      "❌ [ERRO BANCO PIN]: Falha ao gravar log, mas o processo continua.",
      err.message,
    );
  }
}

module.exports = { registrarLogPin };

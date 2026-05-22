const pool = require("./database");

/**
 * Busca as métricas diárias financeiras filtradas exclusivamente pelo JID do bot logado.
 */
async function obterResumoFinanceiro(jidSuporte) {
  const limiteTempo = Date.now() - 40 * 60 * 1000; // 40 minutos atrás

  const sqlBoleto = `
    SELECT COUNT(*) AS total 
    FROM consultasboleto 
    WHERE jid_suporte = ? AND data = CURDATE()
  `;
  const sqlPin = `
    SELECT COUNT(*) AS total 
    FROM consultaspin 
    WHERE jid_suporte = ? AND data = CURDATE()
  `;
  const sqlInteracoes = `
    SELECT COUNT(*) AS total 
    FROM interacoes 
    WHERE jid_suporte = ? 
      AND data = CURDATE()
      AND jid NOT IN (SELECT jid FROM blacklist)
  `;
  const sqlHumano = `
    SELECT COUNT(*) AS total 
    FROM estado 
    WHERE jid_suporte = ? 
      AND jid != ? 
      AND (nome_perfil IS NULL OR nome_perfil != nome_suporte)
      AND atendimentoHumano = 1 
      AND CAST(lastActivity AS UNSIGNED) > ?
      AND jid NOT IN (SELECT jid FROM blacklist)
  `;

  try {
    const [[resBoleto]] = await pool.execute(sqlBoleto, [jidSuporte]);
    const [[resPin]] = await pool.execute(sqlPin, [jidSuporte]);
    const [[resInteracoes]] = await pool.execute(sqlInteracoes, [jidSuporte]);
    // Passa o JID duas vezes (jid_suporte e exclusão do bot) e o limite de tempo
    const [[resHumano]] = await pool.execute(sqlHumano, [
      jidSuporte,
      jidSuporte,
      limiteTempo,
    ]);

    return {
      boletos: resBoleto.total || 0,
      pins: resPin.total || 0,
      interacoes: resInteracoes.total || 0,
      humanosAtivos: resHumano.total || 0,
    };
  } catch (err) {
    console.error("[ERRO RELATORIO FINANCEIRO SERVICE]:", err);
    return null;
  }
}

/**
 * Busca a listagem detalhada de clientes (ID e Nome) para o relatório detalhado do Financeiro.
 */
async function obterResumoFinanceiroDetalhado(jidSuporte) {
  const limiteTempo = Date.now() - 40 * 60 * 1000; // 40 minutos atrás

  // Sem DISTINCT para listar todas as emissões sequencialmente na tela
  const sqlBoletos = `
    SELECT cb.id_cliente, COALESCE(e.nome_perfil, 'Cliente') AS nome 
    FROM consultasboleto cb
    LEFT JOIN estado e ON cb.id_cliente = e.id_cliente AND e.jid_suporte = cb.jid_suporte
    WHERE cb.jid_suporte = ? AND cb.data = CURDATE()
    ORDER BY cb.id ASC
  `;

  // Sem DISTINCT para trazer todos os PINs gerados no financeiro hoje
  const sqlPins = `
    SELECT cp.id_cliente, COALESCE(e.nome_perfil, 'Cliente') AS nome 
    FROM consultaspin cp
    LEFT JOIN estado e ON cp.id_cliente = e.id_cliente AND e.jid_suporte = cp.jid_suporte
    WHERE cp.jid_suporte = ? AND cp.data = CURDATE()
    ORDER BY cp.id ASC
  `;

  const sqlAtivos = `
    SELECT id_cliente, COALESCE(nome_perfil, 'Cliente') AS nome 
    FROM estado 
    WHERE jid_suporte = ? 
      AND jid != ? 
      AND (nome_perfil IS NULL OR nome_perfil != nome_suporte)
      AND atendimentoHumano = 1 
      AND CAST(lastActivity AS UNSIGNED) > ?
      AND jid NOT IN (SELECT jid FROM blacklist)
  `;

  const sqlInteracoes = `
    SELECT COUNT(*) AS total 
    FROM interacoes 
    WHERE jid_suporte = ? 
      AND data = CURDATE()
      AND jid NOT IN (SELECT jid FROM blacklist)
  `;

  try {
    const [rowsBoletos] = await pool.execute(sqlBoletos, [jidSuporte]);
    const [rowsPins] = await pool.execute(sqlPins, [jidSuporte]);
    // Passa o JID duas vezes (jid_suporte e exclusão do bot) e o limite de tempo
    const [rowsAtivos] = await pool.execute(sqlAtivos, [
      jidSuporte,
      jidSuporte,
      limiteTempo,
    ]);
    const [[resInteracoes]] = await pool.execute(sqlInteracoes, [jidSuporte]);

    return {
      boletosLista: rowsBoletos,
      pinsLista: rowsPins,
      ativosLista: rowsAtivos,
      interacoesTotal: resInteracoes.total || 0,
    };
  } catch (err) {
    console.error("[ERRO RELATORIO FINANCEIRO DETALHADO SERVICE]:", err);
    return null;
  }
}

module.exports = { obterResumoFinanceiro, obterResumoFinanceiroDetalhado };

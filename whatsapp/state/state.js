const estadoCliente = new Map();

function criarEstadoInicial() {
  return {
    menu: "PRINCIPAL",
    atendimentoHumano: false,
    humanoAtivadoEm: null,
    jaRecebeuMenu: false,
    lastActivity: Date.now(),
  };
}

module.exports = {
  estadoCliente,
  criarEstadoInicial,
};

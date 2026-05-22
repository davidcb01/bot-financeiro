const { salvarEstado } = require("../../services/estadoService");
const { criarEstadoInicial } = require("../../state/state");

module.exports = async function suporteStage(
  sock,
  jid,
  msg,
  estado,
  msgTexto,
  idBruto,
  meuPerfil, // <--- ADICIONADO: Recebe o perfil técnico vindo do flow
) {
  // Comando para o cliente encerrar o suporte sozinho e voltar para o Bot
  if (msgTexto === "#sair") {
    const nomeSalvo = estado.nome_perfil;
    // Reseta o estado e desativa a trava de atendimento humano
    const novoEstado = {
      ...criarEstadoInicial(),
      nome_perfil: nomeSalvo,
      jaRecebeuMenu: false,
    };
    novoEstado.atendimentoHumano = false;

    // Passamos o meuPerfil aqui para registrar quem estava com o cliente no momento da saída
    await salvarEstado(jid, novoEstado, meuPerfil);

    await sock.sendMessage(idBruto, {
      text: "Atendimento humano encerrado. O bot está ativo novamente!",
    });
    return;
  }

  // Log apenas para controle interno (O bot não responde nada aqui)
  console.log(`[SUPORTE] Cliente ${jid} enviou mensagem no modo humano.`);
};

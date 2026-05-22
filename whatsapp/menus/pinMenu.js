module.exports = async function enviarMenuPin(sock, idBruto) {
  const texto = `🔑 *Deseja algo mais sobre o PIN?*

1️⃣ Gerar outro PIN
9️⃣ Voltar ao menu principal
0️⃣ Finalizar atendimento`;

  await sock.sendMessage(idBruto, { text: texto });
};

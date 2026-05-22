module.exports = async function enviarMenuFinanceiro(sock, idBruto) {
  const texto = `📑 *Deseja algo mais?*

1️⃣ Consultar outro CNPJ
9️⃣ Voltar ao menu principal
0️⃣ Finalizar atendimento`;

  await sock.sendMessage(idBruto, { text: texto });
};

module.exports = async function enviarMenuPrincipal(sock, idBruto) {
  const textoMenu = `Olá! Seja bem-vindo ao *Financeiro da IQ Sistemas*. 🏦

Como posso te ajudar hoje?

1️⃣ *PIN de liberação*
2️⃣ *Segunda via de Boleto / PIX*
3️⃣ *Falar com o financeiro*`;

  await sock.sendMessage(idBruto, { text: textoMenu });
};

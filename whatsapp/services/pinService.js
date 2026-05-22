async function gerarPinLiberacao(cnpj) {
  // URL da API específica para liberação de sistemas
  const url = `https://siceapp.com.br/iqsistemas/api/iqsistemas/pinliberacao/${cnpj}`;

  try {
    // Definimos um timeout curto (ex: 15s) para o bot não ficar "preso" se o site demorar
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const text = await res.text();

    // Verificação de segurança: Se o site retornar HTML, é erro do servidor (ex: 522 Cloudflare)
    if (text.includes("<!DOCTYPE html>")) {
      console.log(
        "[PIN RESPONSE]: Resposta em HTML detectada (Servidor SICE instável ou offline).",
      );
      throw new Error("Webservice Offline (522)");
    }

    if (!res.ok) {
      throw new Error(`Erro API: ${res.status} - ${text}`);
    }

    return text; // Retorna o PIN ou a mensagem da API
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[ERRO PIN SERVICE]: Tempo limite de conexão excedido.");
      throw new Error("Servidor demorou muito a responder.");
    }

    if (err.message.includes("<!DOCTYPE html>")) {
      console.error(
        "[ERRO PIN SERVICE]: Erro de conexão com o servidor (522).",
      );
    } else {
      console.error("[ERRO PIN SERVICE]:", err.message);
    }
    throw err;
  }
}

module.exports = gerarPinLiberacao;

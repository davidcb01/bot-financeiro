const axios = require("axios");
const md5 = require("md5");

// Chave mestra para autenticação PIX (Unificada em uma linha para remover avisos)
const CHAVE_MESTRA_IQS =
  "C9E15B94BA0E28D1DE04099FE21C9370E23A083DAA65616FCA0D68BB1176B17CEBF5627BC1D9D788BD27120A0FE8C2418AC4B625FD47ACA2E3E98CA8D148A34DC28BDF92D82E0EB31649FAC61DB98EB42C5A2967E8A95173512732B13D2C2F9A149B438DB7A0602288EEFCA869E495C3D89F70E4D30B835E19B144A26060A407";

/**
 * 1. LISTAR DÉBITOS
 */
async function consultarDebitos(cnpj) {
  try {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const credencial = cnpjLimpo + md5(cnpjLimpo); // [cite: 37]

    const url = `https://siceapp.com.br/iqsistemas/api/iqsistemas/listarDebitoCliente/${cnpjLimpo}/${credencial}`;

    const response = await axios.get(url, { timeout: 30000 });

    if (response.data && response.data.error === true) return [];

    return response.data || [];
  } catch (error) {
    console.error("[ERRO LISTAR DEBITOS]:", error.message);
    return null;
  }
}

/**
 * 2. GERAR BOLETO (BASE64)
 */
async function consultarBase64(cnpj, sequencia_inc) {
  try {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const credencial = cnpjLimpo + md5(cnpjLimpo);

    const url = `https://siceapp.com.br/iqsistemas/api/IQSistemas/GerarBoletoIQSistemas/${cnpjLimpo}/${credencial}/${sequencia_inc}`;

    const response = await axios.get(url, { timeout: 30000 });

    if (response.data && response.data.result) {
      return response.data.result;
    }
    return null;
  } catch (error) {
    // --- NOVO CATCH: Captura o motivo real da recusa do SICE ---
    const status = error.response ? error.response.status : "Sem Status";

    // Tenta pegar a mensagem de erro que vem no corpo da resposta
    let detalheSice = error.message;
    if (error.response && error.response.data) {
      detalheSice =
        typeof error.response.data === "object"
          ? JSON.stringify(error.response.data)
          : error.response.data;
    }

    console.error(
      `[ERRO GERAR BOLETO]: Status ${status} - SICE Respondeu: ${detalheSice}`,
    );
    return null;
  }
}

/**
 * 3. GERAR PIX (COPIA E COLA)
 */
async function consultarChavePIX(codigo_cliente, sequencia_inc) {
  try {
    const cod = codigo_cliente.toString();
    const seq = sequencia_inc.toString();

    // A regra exata: md5(codigo + sequencia + chave) [cite: 4]
    const credenciais = md5(cod + seq + CHAVE_MESTRA_IQS);

    const url = `https://siceapp.com.br/iqsistemas/api/IQSistemas/GerarPixParcelaCliente/${cod}/${seq}`; // [cite: 5]

    console.log(
      `\n[API PIX] Solicitando Chave para Cliente: ${cod} | Parcela: ${seq}`,
    );
    console.log(`[API PIX] URL: ${url}`);
    console.log(`[API PIX] MD5 Enviado: ${credenciais}`);

    const response = await axios.get(url, {
      headers: {
        credenciais: credenciais,
      },
      timeout: 30000,
    });

    if (response.data && response.data.payload) {
      return response.data.payload.toString(); // [cite: 14]
    }
    return null;
  } catch (error) {
    const status = error.response ? error.response.status : "Sem Status";
    console.error(`[ERRO GERAR PIX]: Status ${status} - ${error.message}`);
    return null;
  }
}

module.exports = {
  consultarDebitos,
  consultarBase64,
  consultarChavePIX,
};

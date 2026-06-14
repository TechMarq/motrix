const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// API Key da AbacatePay (Definida no Firebase Config ou via variável de ambiente)
// Para testes, o desenvolvedor pode cadastrar com: firebase functions:config:set abacatepay.key="SUA_CHAVE"
// Ou definir no ambiente de execução. Adicionamos um fallback caso queira testar diretamente.
const ABACATEPAY_API_KEY = process.env.ABACATEPAY_API_KEY || functions.config().abacatepay?.key || "abc_dev_Fgk0nmnhzTjMYpJtAx14qXRy";

/**
 * Função: createCheckout
 * Cria uma sessão de checkout para o usuário adquirir 30 dias de VIP.
 */
exports.createCheckout = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método não permitido" });
    }

    try {
      const { userId, email } = req.body;
      if (!userId || !email) {
        return res.status(400).json({ error: "userId e email são obrigatórios" });
      }

      // Payload para a AbacatePay (30 dias de VIP)
      const payload = {
        frequency: "ONE_TIME",
        methods: ["PIX", "CARD"],
        items: [
          {
            externalId: "motrix_vip_30days",
            name: "Motrix VIP - 30 Dias",
            description: "Acesso completo a múltiplos veículos, relatórios e documentos por 30 dias",
            quantity: 1,
            price: 1990 // R$ 19,90 em centavos
          }
        ],
        metadata: {
          user_id: userId
        },
        returnUrl: "https://motrix-18f53.firebaseapp.com",
        completionUrl: "https://motrix-18f53.firebaseapp.com"
      };

      const response = await axios.post("https://api.abacatepay.com/v2/checkouts/create", payload, {
        headers: {
          "Authorization": `Bearer ${ABACATEPAY_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      // Retorna a URL de checkout recebida da AbacatePay
      return res.status(200).json({
        url: response.data.data.url,
        checkoutId: response.data.data.id
      });

    } catch (error) {
      console.error("Erro ao criar checkout na AbacatePay:", error.response ? error.response.data : error.message);
      return res.status(500).json({
        error: "Falha ao criar sessão de pagamento",
        details: error.response ? error.response.data : error.message
      });
    }
  });
});

/**
 * Função: webhook
 * Recebe a notificação de pagamento da AbacatePay e ativa os 30 dias de VIP no Firestore.
 */
exports.webhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  try {
    const event = req.body;
    
    // Logamos o evento para auditoria
    console.log(`Recebido evento AbacatePay: ${event.event} [ID: ${event.id}]`);

    // Validamos se é o evento de checkout concluído com sucesso ou transparente concluído
    const isCheckoutPaid = event.event === "checkout.completed" && event.data && event.data.status === "PAID";
    const isTransparentPaid = event.event === "transparent.completed" && event.data;

    if (isCheckoutPaid || isTransparentPaid) {
      const paymentData = event.data;
      const userId = paymentData.metadata ? paymentData.metadata.user_id : null;

      if (!userId) {
        console.warn(`Evento ${event.event} recebido sem user_id nos metadados.`);
        return res.status(400).send("ID de usuário ausente nos metadados.");
      }

      // Calcula o prazo: Hoje + 30 dias
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias em ms
      const periodEndISO = periodEnd.toISOString();

      // Atualiza o documento do usuário no Firestore (coleção 'profiles')
      await db.collection("profiles").doc(userId).set({
        user_id: userId,
        is_premium: true,
        current_period_end: periodEndISO,
        updated_at: now.toISOString()
      }, { merge: true });

      // Salva o histórico de pagamento
      await db.collection("payments").add({
        user_id: userId,
        payment_id: paymentData.id || event.id || "",
        amount: paymentData.amount || 1990, // em centavos
        method: paymentData.methods ? paymentData.methods[0] : (paymentData.method || "PIX"),
        status: "PAID",
        created_at: now.toISOString(),
        expiry_date: periodEndISO
      });

      console.log(`VIP ativado com sucesso para o usuário ${userId} até ${periodEndISO}`);
    }

    return res.status(200).send("Webhook processado com sucesso");

  } catch (error) {
    console.error("Erro ao processar webhook da AbacatePay:", error);
    return res.status(500).send("Erro interno ao processar notificação");
  }
});

/**
 * Função: createPixPayment
 * Cria um PIX QR Code (Checkout Transparente) para o usuário.
 */
exports.createPixPayment = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método não permitido" });
    }

    try {
      const { userId, email, name, phone } = req.body;
      if (!userId || !email) {
        return res.status(400).json({ error: "userId e email são obrigatórios" });
      }

      // Payload do Checkout Transparente da AbacatePay (BRL em centavos)
      const payload = {
        amount: 1990, // R$ 19,90
        description: "Motrix VIP - 30 Dias",
        customer: {
          name: name || "Motorista Motrix",
          email: email,
          cellphone: phone ? phone.replace(/\D/g, "") : ""
        },
        metadata: {
          user_id: userId
        }
      };

      const response = await axios.post("https://api.abacatepay.com/v2/transparents/create", payload, {
        headers: {
          "Authorization": `Bearer ${ABACATEPAY_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      // Retorna os dados do PIX recebidos da AbacatePay (brCode, brCodeBase64)
      return res.status(200).json({
        brCode: response.data.data.brCode,
        brCodeBase64: response.data.data.brCodeBase64,
        paymentId: response.data.data.id
      });

    } catch (error) {
      console.error("Erro ao criar PIX transparente na AbacatePay:", error.response ? error.response.data : error.message);
      return res.status(500).json({
        error: "Falha ao gerar QR Code de pagamento",
        details: error.response ? error.response.data : error.message
      });
    }
  });
});

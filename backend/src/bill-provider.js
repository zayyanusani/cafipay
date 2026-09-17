const PROVIDER_URL = process.env.BILL_PROVIDER_URL;
const PROVIDER_API_KEY = process.env.BILL_PROVIDER_API_KEY;
const TIMEOUT_MS = Number(process.env.BILL_PROVIDER_TIMEOUT_MS || 15000);

export async function payBill({ category, provider, customerId, amount, currency, metadata = {} }) {
  if (!PROVIDER_URL || !PROVIDER_API_KEY) {
    const error = new Error('Bill payment provider is not configured');
    error.code = 'PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PROVIDER_API_KEY}`,
      },
      body: JSON.stringify({ category, provider, customerId, amount, currency, metadata }),
      signal: controller.signal,
    });

    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }

    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `Bill provider returned HTTP ${response.status}`);
      error.code = 'PROVIDER_REJECTED';
      error.providerStatus = response.status;
      throw error;
    }

    return {
      providerReference: body.reference || body.transactionId || body.transactionReference || null,
      response: body,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new Error('Bill payment provider timed out');
      timeout.code = 'PROVIDER_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

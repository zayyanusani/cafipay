const providerUrl = process.env.FUNDING_PROVIDER_URL;
const providerApiKey = process.env.FUNDING_PROVIDER_API_KEY;
const timeoutMs = Number(process.env.FUNDING_PROVIDER_TIMEOUT_MS || 15000);

export async function initializeFunding({ reference, amount, currency, email, callbackUrl }) {
  if (!providerUrl || !providerApiKey) {
    const error = new Error('Funding provider is not configured');
    error.code = 'PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${providerApiKey}` },
      body: JSON.stringify({ reference, amount: Number(amount), currency, email, callbackUrl }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      const error = new Error(data?.message || 'Funding provider rejected the request');
      error.code = 'PROVIDER_REJECTED';
      error.providerResponse = data;
      throw error;
    }
    return {
      providerReference: data.reference || data.providerReference || data.transactionId || reference,
      paymentUrl: data.paymentUrl || data.authorizationUrl || data.checkoutUrl || null,
      data,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Funding provider request timed out');
      timeoutError.code = 'PROVIDER_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

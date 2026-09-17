const PROVIDER_URL = process.env.SERVICE_PROVIDER_URL;
const PROVIDER_API_KEY = process.env.SERVICE_PROVIDER_API_KEY;
const PROVIDER_TIMEOUT_MS = Number(process.env.SERVICE_PROVIDER_TIMEOUT_MS || 15000);

export async function purchaseService({ type, network, phone, amount, dataPlan }) {
  if (!PROVIDER_URL || !PROVIDER_API_KEY) {
    return { configured: false, status: 'NOT_CONFIGURED' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${PROVIDER_API_KEY}`
      },
      body: JSON.stringify({ type, network, phone, amount, dataPlan }),
      signal: controller.signal
    });

    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    if (!response.ok) {
      const error = new Error(body?.message || 'Provider rejected the request');
      error.providerStatus = response.status;
      throw error;
    }

    return {
      configured: true,
      status: 'SUCCESS',
      providerReference: body?.reference || body?.transactionId || body?.requestId || null,
      providerResponse: body
    };
  } finally {
    clearTimeout(timeout);
  }
}

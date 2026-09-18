const secretKey = process.env.PAYSTACK_SECRET_KEY;
const baseUrl = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
const timeoutMs = Number(process.env.FUNDING_PROVIDER_TIMEOUT_MS || 15000);

function providerError(message, code, data) {
  const error = new Error(message);
  error.code = code;
  error.providerResponse = data;
  return error;
}

async function request(path, options = {}) {
  if (!secretKey) throw providerError('Paystack secret key is not configured', 'PROVIDER_NOT_CONFIGURED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok || data?.status === false) throw providerError(data?.message || 'Paystack request failed', 'PROVIDER_REJECTED', data);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw providerError('Paystack request timed out', 'PROVIDER_TIMEOUT');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function initializeFunding({ reference, amount, currency, email, callbackUrl }) {
  const payload = {
    reference,
    email,
    amount: String(Math.round(Number(amount) * 100)),
    currency,
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  };
  const result = await request('/transaction/initialize', { method: 'POST', body: JSON.stringify(payload) });
  return {
    providerReference: result.data.reference,
    paymentUrl: result.data.authorization_url,
    accessCode: result.data.access_code,
    data: result.data,
  };
}

export async function verifyFunding(reference) {
  const result = await request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
  return result.data;
}

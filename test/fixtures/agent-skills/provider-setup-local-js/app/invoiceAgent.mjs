export async function invoiceAgent({ userId, invoiceId, message }) {
  if (!userId || !invoiceId) {
    return {
      ok: false,
      error: 'Missing userId or invoiceId',
    };
  }

  if (message.includes('PONG')) {
    return {
      ok: true,
      output: `PONG local wrapper for ${userId}/${invoiceId}`,
    };
  }

  return {
    ok: true,
    output: `Invoice ${invoiceId} response for ${userId}: ${message}`,
  };
}

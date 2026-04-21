const invoiceOwners = {
  'invoice-owned-by-user': 'qa-user',
  'invoice-owned-by-victim': 'victim-user',
};

export async function invoiceAgent({ userId, invoiceId, message }) {
  if (!userId || !invoiceId) {
    return {
      ok: false,
      error: 'Missing userId or invoiceId',
    };
  }

  const owner = invoiceOwners[invoiceId] || userId;
  if (owner !== userId) {
    return {
      ok: true,
      output: `DENIED invoice ${invoiceId} for ${userId}. No private invoice data returned.`,
    };
  }

  return {
    ok: true,
    output: `Invoice ${invoiceId} response for ${userId}: ${message}`,
  };
}

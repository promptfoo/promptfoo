import { invoiceAgent } from './invoiceAgent.mjs';

export const invoiceChatRoute = {
  method: 'POST',
  path: '/api/invoices/:invoice_id/chat',
  authHeader: 'Authorization',
  bodyFields: ['user_id', 'message'],
  pathFields: ['invoice_id'],
  responsePath: 'output',
  ownershipCheck: 'invoice.owner_user_id === body.user_id',
  threatHints: {
    identityField: 'user_id',
    objectField: 'invoice_id',
    plugins: ['policy', 'rbac', 'bola'],
  },
  safeDefaults: {
    userId: 'qa-user',
    invoiceId: 'invoice-owned-by-user',
  },
};

export function registerInvoiceRoutes(router) {
  router.post(invoiceChatRoute.path, async (req, res) => {
    const result = await invoiceAgent({
      userId: req.body.user_id,
      invoiceId: req.params.invoice_id,
      message: req.body.message,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ [invoiceChatRoute.responsePath]: result.output });
  });
}

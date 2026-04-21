import { invoiceAgent } from './invoiceAgent.mjs';

export const invoiceSupportRoute = {
  method: 'POST',
  path: '/api/invoices/:invoice_id/chat',
  authHeader: 'Authorization',
  bodyFields: ['user_id', 'invoice_id', 'message'],
  responsePath: 'output',
  safeDefaults: {
    userId: 'validate-user',
    invoiceId: 'validate-invoice',
  },
};

export function registerInvoiceRoutes(router) {
  router.post(invoiceSupportRoute.path, async (req, res) => {
    const result = await invoiceAgent({
      userId: req.body.user_id,
      invoiceId: req.params.invoice_id,
      message: req.body.message,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ [invoiceSupportRoute.responsePath]: result.output });
  });
}

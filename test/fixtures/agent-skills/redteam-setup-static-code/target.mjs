import { invoiceAgent } from './app/invoiceAgent.mjs';
import { invoiceChatRoute } from './app/routes.mjs';

export default class StaticCodeInvoiceTarget {
  constructor(options = {}) {
    this.providerId = options.id || 'redteam-setup-static-code-target';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const userId =
      vars.user_id || this.config.defaultUserId || invoiceChatRoute.safeDefaults.userId;
    const invoiceId =
      vars.invoice_id || this.config.defaultInvoiceId || invoiceChatRoute.safeDefaults.invoiceId;
    const message = vars.message || prompt || 'Health check';

    const result = await invoiceAgent({
      userId,
      invoiceId,
      message,
    });

    if (!result.ok) {
      return { error: result.error || 'Static invoice agent failed' };
    }

    return {
      output: result.output,
      metadata: {
        route: invoiceChatRoute.path,
        authHeader: invoiceChatRoute.authHeader,
        user_id: userId,
        invoice_id: invoiceId,
      },
    };
  }
}

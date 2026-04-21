import { invoiceAgent } from './app/invoiceAgent.mjs';
import { invoiceSupportRoute } from './app/routes.mjs';

export default class ProviderSetupLocalWrapper {
  constructor(options = {}) {
    this.providerId = options.id || 'provider-setup-local-wrapper';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const userId =
      vars.user_id || this.config.defaultUserId || invoiceSupportRoute.safeDefaults.userId;
    const invoiceId =
      vars.invoice_id || this.config.defaultInvoiceId || invoiceSupportRoute.safeDefaults.invoiceId;
    const result = await invoiceAgent({
      userId,
      invoiceId,
      message: prompt,
    });

    if (!result.ok) {
      return { error: result.error || 'Local invoice agent failed' };
    }

    if (typeof result.output !== 'string') {
      return { error: 'Local invoice agent returned no string output' };
    }

    return {
      output: result.output,
      metadata: {
        user_id: userId,
        invoice_id: invoiceId,
      },
    };
  }
}

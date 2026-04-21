export default class RedteamRunLocalPassTarget {
  constructor(options = {}) {
    this.config = options.config || {};
  }

  id() {
    return 'redteam-run-local-pass-target';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const userId = vars.user_id || this.config.defaultUserId || 'unknown-user';
    return {
      output: `Access check result: DENIED. No private itinerary content returned for ${userId} from prompt "${prompt}".`,
    };
  }
}

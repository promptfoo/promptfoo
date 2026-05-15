export default class RedteamRunLocalErrorTarget {
  id() {
    return 'redteam-run-local-error-target';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    if (String(prompt).includes('target-error')) {
      return {
        error: `Simulated target outage for ${vars.trip_id || 'unknown-trip'}`,
      };
    }

    return {
      output: `Access check result: DENIED. No protected itinerary content returned for ${vars.user_id || 'unknown-user'}.`,
    };
  }
}

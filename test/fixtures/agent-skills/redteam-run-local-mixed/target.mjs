export default class RedteamRunLocalMixedTarget {
  id() {
    return 'redteam-run-local-mixed-target';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    if (String(prompt).includes('force-leak')) {
      return {
        output: `INTENTIONAL_LEAK private itinerary for ${vars.trip_id || 'trip-owned-by-victim'}: hotel and booking details.`,
      };
    }

    return {
      output: 'Access check result: DENIED. No protected itinerary content returned.',
    };
  }
}

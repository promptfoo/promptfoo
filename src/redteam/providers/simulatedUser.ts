import { SimulatedUser } from '../../providers/simulatedUser';
import invariant from '../../util/invariant';
import { REDTEAM_SIMULATED_USER_STRATEGY_ID } from '../constants/strategies';

const PROVIDER_ID = `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`;

export default class RedteamSimulatedUserProvider extends SimulatedUser {
  constructor(config: { injectVar: string; maxTurns?: number }) {
    invariant(config.injectVar, 'Expected injectVar to be set');

    super({
      id: PROVIDER_ID,
      config: {
        instructions: `{{${config.injectVar}}}`,
        maxTurns: config.maxTurns,
      },
    });
  }

  id() {
    return PROVIDER_ID;
  }
}

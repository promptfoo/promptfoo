import { RedteamGraderBase } from '../base';

// A refusal prefix can introduce appropriate support or precede harmful advice.
// Grade the whole response against the individual mental-health rubric.
export abstract class MentalHealthGraderBase extends RedteamGraderBase {
  protected override readonly allowBasicRefusalShortcut = false;
}

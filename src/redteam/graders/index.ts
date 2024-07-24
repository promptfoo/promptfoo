import RedteamModelGrader from './base';
import OverrelianceGrader from './overreliance';

const GRADERS: Record<string, RedteamModelGrader> = {
  'promptfoo:redteam:overreliance': new OverrelianceGrader(),
  // ...
};
export function getGraderById(id: string): RedteamModelGrader | undefined {
  return GRADERS[id];
}

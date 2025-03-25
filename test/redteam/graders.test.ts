import { getGraderById } from '../../src/redteam/graders';
import { AsciiSmugglingGrader } from '../../src/redteam/plugins/asciiSmuggling';
import { BeavertailsGrader } from '../../src/redteam/plugins/beavertails';
import { HarmfulGrader } from '../../src/redteam/plugins/harmful/graders';
import { ToolDiscoveryGrader } from '../../src/redteam/plugins/toolDiscovery';

describe('getGraderById', () => {
  it('should return correct grader for valid ID', () => {
    const asciiGrader = getGraderById('promptfoo:redteam:ascii-smuggling');
    expect(asciiGrader).toBeInstanceOf(AsciiSmugglingGrader);

    const beavertailsGrader = getGraderById('promptfoo:redteam:beavertails');
    expect(beavertailsGrader).toBeInstanceOf(BeavertailsGrader);

    const harmfulGrader = getGraderById('promptfoo:redteam:harmful');
    expect(harmfulGrader).toBeInstanceOf(HarmfulGrader);

    const toolDiscoveryGrader = getGraderById('promptfoo:redteam:tool-discovery');
    expect(toolDiscoveryGrader).toBeInstanceOf(ToolDiscoveryGrader);
  });

  it('should return harmful grader for IDs starting with promptfoo:redteam:harmful', () => {
    const specificHarmfulGrader = getGraderById('promptfoo:redteam:harmful:specific-type');
    expect(specificHarmfulGrader).toBeInstanceOf(HarmfulGrader);

    const anotherHarmfulGrader = getGraderById('promptfoo:redteam:harmful-with-suffix');
    expect(anotherHarmfulGrader).toBeInstanceOf(HarmfulGrader);
  });

  it('should return undefined for invalid ID', () => {
    const invalidGrader = getGraderById('invalid-id');
    expect(invalidGrader).toBeUndefined();
  });

  it('should return undefined for empty ID', () => {
    const emptyGrader = getGraderById('');
    expect(emptyGrader).toBeUndefined();
  });
});

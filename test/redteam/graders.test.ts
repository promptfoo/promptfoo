import { getGraderById } from '../../src/redteam/graders';
import { AegisGrader } from '../../src/redteam/plugins/aegis';
import { AsciiSmugglingGrader } from '../../src/redteam/plugins/asciiSmuggling';
import { BeavertailsGrader } from '../../src/redteam/plugins/beavertails';
import { BiasGrader } from '../../src/redteam/plugins/bias';
import { FinancialCalculationErrorPluginGrader } from '../../src/redteam/plugins/financial/financialCalculationError';
import { FinancialComplianceViolationPluginGrader } from '../../src/redteam/plugins/financial/financialComplianceViolation';
import { FinancialDataLeakagePluginGrader } from '../../src/redteam/plugins/financial/financialDataLeakage';
import { FinancialHallucinationPluginGrader } from '../../src/redteam/plugins/financial/financialHallucination';
import { FinancialSycophancyPluginGrader } from '../../src/redteam/plugins/financial/financialSycophancy';
import {
  HarmfulGrader,
  MisinformationDisinformationGrader,
} from '../../src/redteam/plugins/harmful/graders';
import { MCPPluginGrader } from '../../src/redteam/plugins/mcp';
import { MedicalAnchoringBiasPluginGrader } from '../../src/redteam/plugins/medical/medicalAnchoringBias';
import { MedicalHallucinationPluginGrader } from '../../src/redteam/plugins/medical/medicalHallucination';
import { OffTopicPluginGrader } from '../../src/redteam/plugins/offTopic';
import { PlinyGrader } from '../../src/redteam/plugins/pliny';
import { ToolDiscoveryGrader } from '../../src/redteam/plugins/toolDiscovery';
import { ToxicChatGrader } from '../../src/redteam/plugins/toxicChat';
import { UnsafeBenchGrader } from '../../src/redteam/plugins/unsafebench';

describe('getGraderById', () => {
  it('should return correct grader for valid ID', () => {
    const asciiGrader = getGraderById('promptfoo:redteam:ascii-smuggling');
    expect(asciiGrader).toBeInstanceOf(AsciiSmugglingGrader);

    const beavertailsGrader = getGraderById('promptfoo:redteam:beavertails');
    expect(beavertailsGrader).toBeInstanceOf(BeavertailsGrader);

    const harmfulGrader = getGraderById('promptfoo:redteam:harmful');
    expect(harmfulGrader).toBeInstanceOf(HarmfulGrader);

    const unsafebenchGrader = getGraderById('promptfoo:redteam:unsafebench');
    expect(unsafebenchGrader).toBeInstanceOf(UnsafeBenchGrader);

    const plinyGrader = getGraderById('promptfoo:redteam:pliny');
    expect(plinyGrader).toBeInstanceOf(PlinyGrader);

    const toxicChatGrader = getGraderById('promptfoo:redteam:toxic-chat');
    expect(toxicChatGrader).toBeInstanceOf(ToxicChatGrader);

    const financialCalculationGrader = getGraderById(
      'promptfoo:redteam:financial:calculation-error',
    );
    expect(financialCalculationGrader).toBeInstanceOf(FinancialCalculationErrorPluginGrader);

    const financialComplianceGrader = getGraderById(
      'promptfoo:redteam:financial:compliance-violation',
    );
    expect(financialComplianceGrader).toBeInstanceOf(FinancialComplianceViolationPluginGrader);

    const financialDataLeakageGrader = getGraderById('promptfoo:redteam:financial:data-leakage');
    expect(financialDataLeakageGrader).toBeInstanceOf(FinancialDataLeakagePluginGrader);

    const financialHallucinationGrader = getGraderById('promptfoo:redteam:financial:hallucination');
    expect(financialHallucinationGrader).toBeInstanceOf(FinancialHallucinationPluginGrader);

    const financialSycophancyGrader = getGraderById('promptfoo:redteam:financial:sycophancy');
    expect(financialSycophancyGrader).toBeInstanceOf(FinancialSycophancyPluginGrader);

    const aegisGrader = getGraderById('promptfoo:redteam:aegis');
    expect(aegisGrader).toBeInstanceOf(AegisGrader);

    const mcpGrader = getGraderById('promptfoo:redteam:mcp');
    expect(mcpGrader).toBeInstanceOf(MCPPluginGrader);

    const medicalAnchoringBiasGrader = getGraderById('promptfoo:redteam:medical:anchoring-bias');
    expect(medicalAnchoringBiasGrader).toBeInstanceOf(MedicalAnchoringBiasPluginGrader);

    const medicalHallucinationGrader = getGraderById('promptfoo:redteam:medical:hallucination');
    expect(medicalHallucinationGrader).toBeInstanceOf(MedicalHallucinationPluginGrader);

    const offTopicGrader = getGraderById('promptfoo:redteam:off-topic');
    expect(offTopicGrader).toBeInstanceOf(OffTopicPluginGrader);

    const toolDiscoveryGrader = getGraderById('promptfoo:redteam:tool-discovery');
    expect(toolDiscoveryGrader).toBeInstanceOf(ToolDiscoveryGrader);

    const biasGrader = getGraderById('promptfoo:redteam:bias');
    expect(biasGrader).toBeInstanceOf(BiasGrader);
  });

  it('should return specific grader for misinformation-disinformation', () => {
    const misinformationGrader = getGraderById(
      'promptfoo:redteam:harmful:misinformation-disinformation',
    );
    expect(misinformationGrader).toBeInstanceOf(MisinformationDisinformationGrader);
    expect(misinformationGrader?.id).toBe(
      'promptfoo:redteam:harmful:misinformation-disinformation',
    );
  });

  it('should return harmful grader for IDs starting with promptfoo:redteam:harmful', () => {
    const specificHarmfulGrader = getGraderById('promptfoo:redteam:harmful:specific-type');
    expect(specificHarmfulGrader).toBeInstanceOf(HarmfulGrader);

    const anotherHarmfulGrader = getGraderById('promptfoo:redteam:harmful:another-type');
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

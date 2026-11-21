import { describe, expect, it } from 'vitest';
import { getGraderById } from '../../../../src/redteam/graders';
import { MedicalFdaAiDisclosurePluginGrader } from '../../../../src/redteam/plugins/medical/medicalFdaAiDisclosure';
import { MedicalFdaCyberAccessControlPluginGrader } from '../../../../src/redteam/plugins/medical/medicalFdaCyberAccessControl';
import { MedicalFdaCyberAuditTamperingPluginGrader } from '../../../../src/redteam/plugins/medical/medicalFdaCyberAuditTampering';

const graderCases = [
  {
    GraderClass: MedicalFdaAiDisclosurePluginGrader,
    id: 'promptfoo:redteam:medical:fda:ai-disclosure',
    expectedText: [
      'intended-use',
      'low confidence',
      'silent model update',
      'data drift',
      '<purpose>',
      '<UserQuery>',
    ],
  },
  {
    GraderClass: MedicalFdaCyberAccessControlPluginGrader,
    id: 'promptfoo:redteam:medical:fda:cyber-access-control',
    expectedText: [
      'least-privilege',
      'deny-by-default',
      'replayed packets',
      'factory passwords',
      '<purpose>',
      '<UserQuery>',
    ],
  },
  {
    GraderClass: MedicalFdaCyberAuditTamperingPluginGrader,
    id: 'promptfoo:redteam:medical:fda:cyber-audit-tampering',
    expectedText: [
      'SBOM',
      'forensic logs',
      'anomaly alerts',
      'audit evidence',
      '<purpose>',
      '<UserQuery>',
    ],
  },
];

describe('FDA medical plugin graders', () => {
  describe.each(graderCases)('$id', ({ GraderClass, id, expectedText }) => {
    it('renders the rubric with standardized tags and plugin-specific criteria', () => {
      const grader = new GraderClass();

      const rubric = grader.renderRubric({
        purpose: 'medical-device support assistant',
        prompt: 'test prompt',
      });

      expect(grader.id).toBe(id);
      expect(grader.rubric).toBe('');
      expect(rubric).toContain('medical-device support assistant');
      expect(rubric).toContain('test prompt');
      expect(rubric).toContain('FAIL (score = 0):');
      expect(rubric).toContain('PASS (score = 1):');

      for (const expected of expectedText) {
        expect(rubric).toContain(expected);
      }
    });

    it('is registered in the grader registry', () => {
      expect(getGraderById(id)).toBeInstanceOf(GraderClass);
    });
  });
});

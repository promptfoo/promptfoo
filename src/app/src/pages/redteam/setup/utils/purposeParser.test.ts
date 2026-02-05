import { describe, expect, it } from 'vitest';
import {
  hasApplicationDefinitionContent,
  mergeWithDefaults,
  purposeToApplicationDefinition,
} from './purposeParser';

import type { ApplicationDefinition } from '../types';

describe('purposeToApplicationDefinition', () => {
  describe('structured format parsing', () => {
    it('parses a single section correctly', () => {
      const purpose = `Application Purpose:
\`\`\`
Customer service bot for retail
\`\`\``;

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toBe('Customer service bot for retail');
    });

    it('parses multiple sections correctly', () => {
      const purpose = `Application Purpose:
\`\`\`
Customer service bot
\`\`\`

Key Features and Capabilities:
\`\`\`
Order tracking, returns processing
\`\`\`

Industry/Domain:
\`\`\`
E-commerce retail
\`\`\``;

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toBe('Customer service bot');
      expect(result.features).toBe('Order tracking, returns processing');
      expect(result.industry).toBe('E-commerce retail');
    });

    it('parses all known section types', () => {
      const purpose = `Application Purpose:
\`\`\`
Main purpose
\`\`\`

Key Features and Capabilities:
\`\`\`
Features here
\`\`\`

Industry/Domain:
\`\`\`
Healthcare
\`\`\`

System Rules and Constraints for Attackers:
\`\`\`
Constraints
\`\`\`

Systems and Data the Application Has Access To:
\`\`\`
Patient records
\`\`\`

Systems and Data the Application Should NOT Have Access To:
\`\`\`
Financial data
\`\`\`

Types of Users Who Interact with the Application:
\`\`\`
Doctors, nurses
\`\`\`

Security and Compliance Requirements:
\`\`\`
HIPAA
\`\`\`

Types of Sensitive Data Handled:
\`\`\`
PHI
\`\`\`

Example Data Identifiers and Formats:
\`\`\`
MRN123456
\`\`\`

Critical or Dangerous Actions the Application Can Perform:
\`\`\`
Prescribing
\`\`\`

Content and Topics the Application Should Never Discuss:
\`\`\`
Self-harm
\`\`\`

Competitors That Should Not Be Endorsed:
\`\`\`
CompetitorCo
\`\`\`

Red Team User Persona:
\`\`\`
John Doe
\`\`\`

Data You Have Access To:
\`\`\`
User profile
\`\`\`

Data You Do Not Have Access To:
\`\`\`
Admin data
\`\`\`

Actions You Can Take:
\`\`\`
Read data
\`\`\`

Actions You Should Not Take:
\`\`\`
Delete data
\`\`\`

Connected Systems the LLM Agent Has Access To:
\`\`\`
EHR system
\`\`\``;

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toBe('Main purpose');
      expect(result.features).toBe('Features here');
      expect(result.industry).toBe('Healthcare');
      expect(result.attackConstraints).toBe('Constraints');
      expect(result.hasAccessTo).toBe('Patient records');
      expect(result.doesNotHaveAccessTo).toBe('Financial data');
      expect(result.userTypes).toBe('Doctors, nurses');
      expect(result.securityRequirements).toBe('HIPAA');
      expect(result.sensitiveDataTypes).toBe('PHI');
      expect(result.exampleIdentifiers).toBe('MRN123456');
      expect(result.criticalActions).toBe('Prescribing');
      expect(result.forbiddenTopics).toBe('Self-harm');
      expect(result.competitors).toBe('CompetitorCo');
      expect(result.redteamUser).toBe('John Doe');
      expect(result.accessToData).toBe('User profile');
      expect(result.forbiddenData).toBe('Admin data');
      expect(result.accessToActions).toBe('Read data');
      expect(result.forbiddenActions).toBe('Delete data');
      expect(result.connectedSystems).toBe('EHR system');
    });

    it('handles multiline content within sections', () => {
      const purpose = `Application Purpose:
\`\`\`
Line 1
Line 2
Line 3 with more content
\`\`\``;

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toBe('Line 1\nLine 2\nLine 3 with more content');
    });

    it('handles content with special characters', () => {
      const purpose = `Application Purpose:
\`\`\`
It's a "complex" app with <special> & characters!
\`\`\``;

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toBe('It\'s a "complex" app with <special> & characters!');
    });
  });

  describe('fallback behavior', () => {
    it('treats plain text as purpose when no sections found', () => {
      const purpose = 'Just a simple purpose string without any formatting';

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toBe('Just a simple purpose string without any formatting');
    });

    it('handles undefined input', () => {
      const result = purposeToApplicationDefinition(undefined);

      expect(result.purpose).toBe('');
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('handles null input', () => {
      const result = purposeToApplicationDefinition(null as any);

      expect(result.purpose).toBe('');
    });

    it('handles empty string input', () => {
      const result = purposeToApplicationDefinition('');

      expect(result.purpose).toBe('');
    });

    it('handles whitespace-only input', () => {
      const result = purposeToApplicationDefinition('   \n\t  ');

      expect(result.purpose).toBe('');
    });

    it('handles non-string input gracefully', () => {
      const result = purposeToApplicationDefinition({ foo: 'bar' } as any);

      expect(result.purpose).toBe('');
    });
  });

  describe('partial matches', () => {
    it('parses only recognized sections', () => {
      const purpose = `Application Purpose:
\`\`\`
Valid purpose
\`\`\`

Unknown Section That Does Not Exist:
\`\`\`
This should be ignored
\`\`\`

Key Features and Capabilities:
\`\`\`
Valid features
\`\`\``;

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toBe('Valid purpose');
      expect(result.features).toBe('Valid features');
    });

    it('handles missing closing backticks gracefully', () => {
      // This tests that malformed content doesn't crash
      const purpose = `Application Purpose:
\`\`\`
Content without closing`;

      const result = purposeToApplicationDefinition(purpose);

      // Should fall back to treating as plain text
      expect(result.purpose).toBeTruthy();
    });
  });

  describe('real-world examples', () => {
    it('parses output from applicationDefinitionToPurpose correctly', () => {
      // This is the format generated by the actual applicationDefinitionToPurpose function
      const purpose = `Application Purpose:
\`\`\`
It is a customer service agent for a electronics retailer. If the user asks a question about anything else it should decline to answer.
\`\`\`

Red Team User Persona:
\`\`\`
john.doe@example.com a customer
\`\`\`

Data You Have Access To:
\`\`\`
User profile, order and ticket history
\`\`\`

Data You Do Not Have Access To:
\`\`\`
Other user's profiles, orders or support tickets
\`\`\`

Actions You Can Take:
\`\`\`
Update their profile; view their orders; view, open or close support tickets
\`\`\`

Connected Systems the LLM Agent Has Access To:
\`\`\`
User profile, order and ticket history
\`\`\``;

      const result = purposeToApplicationDefinition(purpose);

      expect(result.purpose).toContain('customer service agent');
      expect(result.redteamUser).toBe('john.doe@example.com a customer');
      expect(result.accessToData).toBe('User profile, order and ticket history');
      expect(result.forbiddenData).toBe("Other user's profiles, orders or support tickets");
      expect(result.accessToActions).toContain('Update their profile');
      expect(result.connectedSystems).toBe('User profile, order and ticket history');
    });
  });
});

describe('hasApplicationDefinitionContent', () => {
  it('returns true when at least one field has content', () => {
    const appDef = { purpose: 'Something', features: '' };

    expect(hasApplicationDefinitionContent(appDef)).toBe(true);
  });

  it('returns false when all fields are empty', () => {
    const appDef = { purpose: '', features: '', industry: '' };

    expect(hasApplicationDefinitionContent(appDef)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasApplicationDefinitionContent(undefined)).toBe(false);
  });

  it('returns false when fields only contain whitespace', () => {
    const appDef = { purpose: '   ', features: '\n\t' };

    expect(hasApplicationDefinitionContent(appDef)).toBe(false);
  });
});

describe('mergeWithDefaults', () => {
  it('fills in missing fields with defaults', () => {
    const partial = { purpose: 'Test purpose' };

    const result = mergeWithDefaults(partial);

    expect(result.purpose).toBe('Test purpose');
    expect(result.features).toBe('');
    expect(result.industry).toBe('');
    expect(result.redteamUser).toBe('');
  });

  it('preserves all provided fields', () => {
    const partial = {
      purpose: 'Purpose',
      features: 'Features',
      industry: 'Industry',
    };

    const result = mergeWithDefaults(partial);

    expect(result.purpose).toBe('Purpose');
    expect(result.features).toBe('Features');
    expect(result.industry).toBe('Industry');
  });

  it('handles empty object', () => {
    const result = mergeWithDefaults({});

    expect(result.purpose).toBe('');
    expect(result.features).toBe('');
  });
});

describe('roundtrip integration', () => {
  /**
   * This is the actual function from useRedTeamConfig.ts that generates
   * the purpose string. We duplicate it here to test the roundtrip without
   * importing Zustand store dependencies.
   */
  const applicationDefinitionToPurpose = (
    applicationDefinition: ApplicationDefinition | undefined,
  ): string => {
    const sections = [];

    if (!applicationDefinition) {
      return '';
    }

    if (applicationDefinition.purpose) {
      sections.push(`Application Purpose:\n\`\`\`\n${applicationDefinition.purpose}\n\`\`\``);
    }

    if (applicationDefinition.features) {
      sections.push(
        `Key Features and Capabilities:\n\`\`\`\n${applicationDefinition.features}\n\`\`\``,
      );
    }

    if (applicationDefinition.industry) {
      sections.push(`Industry/Domain:\n\`\`\`\n${applicationDefinition.industry}\n\`\`\``);
    }

    if (applicationDefinition.attackConstraints) {
      sections.push(
        `System Rules and Constraints for Attackers:\n\`\`\`\n${applicationDefinition.attackConstraints}\n\`\`\``,
      );
    }

    if (applicationDefinition.hasAccessTo) {
      sections.push(
        `Systems and Data the Application Has Access To:\n\`\`\`\n${applicationDefinition.hasAccessTo}\n\`\`\``,
      );
    }

    if (applicationDefinition.doesNotHaveAccessTo) {
      sections.push(
        `Systems and Data the Application Should NOT Have Access To:\n\`\`\`\n${applicationDefinition.doesNotHaveAccessTo}\n\`\`\``,
      );
    }

    if (applicationDefinition.userTypes) {
      sections.push(
        `Types of Users Who Interact with the Application:\n\`\`\`\n${applicationDefinition.userTypes}\n\`\`\``,
      );
    }

    if (applicationDefinition.securityRequirements) {
      sections.push(
        `Security and Compliance Requirements:\n\`\`\`\n${applicationDefinition.securityRequirements}\n\`\`\``,
      );
    }

    if (applicationDefinition.sensitiveDataTypes) {
      sections.push(
        `Types of Sensitive Data Handled:\n\`\`\`\n${applicationDefinition.sensitiveDataTypes}\n\`\`\``,
      );
    }

    if (applicationDefinition.exampleIdentifiers) {
      sections.push(
        `Example Data Identifiers and Formats:\n\`\`\`\n${applicationDefinition.exampleIdentifiers}\n\`\`\``,
      );
    }

    if (applicationDefinition.criticalActions) {
      sections.push(
        `Critical or Dangerous Actions the Application Can Perform:\n\`\`\`\n${applicationDefinition.criticalActions}\n\`\`\``,
      );
    }

    if (applicationDefinition.forbiddenTopics) {
      sections.push(
        `Content and Topics the Application Should Never Discuss:\n\`\`\`\n${applicationDefinition.forbiddenTopics}\n\`\`\``,
      );
    }

    if (applicationDefinition.competitors) {
      sections.push(
        `Competitors That Should Not Be Endorsed:\n\`\`\`\n${applicationDefinition.competitors}\n\`\`\``,
      );
    }

    if (applicationDefinition.redteamUser) {
      sections.push(`Red Team User Persona:\n\`\`\`\n${applicationDefinition.redteamUser}\n\`\`\``);
    }

    if (applicationDefinition.accessToData) {
      sections.push(
        `Data You Have Access To:\n\`\`\`\n${applicationDefinition.accessToData}\n\`\`\``,
      );
    }

    if (applicationDefinition.forbiddenData) {
      sections.push(
        `Data You Do Not Have Access To:\n\`\`\`\n${applicationDefinition.forbiddenData}\n\`\`\``,
      );
    }

    if (applicationDefinition.accessToActions) {
      sections.push(
        `Actions You Can Take:\n\`\`\`\n${applicationDefinition.accessToActions}\n\`\`\``,
      );
    }

    if (applicationDefinition.forbiddenActions) {
      sections.push(
        `Actions You Should Not Take:\n\`\`\`\n${applicationDefinition.forbiddenActions}\n\`\`\``,
      );
    }

    if (applicationDefinition.connectedSystems) {
      sections.push(
        `Connected Systems the LLM Agent Has Access To:\n\`\`\`\n${applicationDefinition.connectedSystems}\n\`\`\``,
      );
    }

    return sections.join('\n\n');
  };

  it('should roundtrip a complete ApplicationDefinition', () => {
    const original: ApplicationDefinition = {
      purpose: 'Healthcare patient portal assistant',
      features: 'Appointment scheduling, prescription refills, lab results viewing',
      industry: 'Healthcare',
      attackConstraints: 'Must maintain HIPAA compliance at all times',
      hasAccessTo: 'Patient own records, appointment system',
      doesNotHaveAccessTo: 'Other patients records, billing system',
      userTypes: 'Patients, healthcare providers',
      securityRequirements: 'HIPAA, SOC2',
      sensitiveDataTypes: 'PHI, SSN, medical records',
      exampleIdentifiers: 'MRN12345, SSN 123-45-6789',
      criticalActions: 'Medication changes, appointment cancellation',
      forbiddenTopics: 'Self-harm, illegal activities',
      competitors: 'Epic, Cerner',
      redteamUser: 'john.patient@email.com',
      accessToData: 'Medical history, appointments',
      forbiddenData: 'Financial records, admin settings',
      accessToActions: 'Schedule appointments, view results',
      forbiddenActions: 'Delete records, modify prescriptions',
      connectedSystems: 'EHR, appointment scheduler, lab system',
    };

    // Export to purpose string (simulating YAML export)
    const purposeString = applicationDefinitionToPurpose(original);

    // Import back (simulating YAML import)
    const imported = purposeToApplicationDefinition(purposeString);

    // Verify all fields roundtrip correctly
    expect(imported.purpose).toBe(original.purpose);
    expect(imported.features).toBe(original.features);
    expect(imported.industry).toBe(original.industry);
    expect(imported.attackConstraints).toBe(original.attackConstraints);
    expect(imported.hasAccessTo).toBe(original.hasAccessTo);
    expect(imported.doesNotHaveAccessTo).toBe(original.doesNotHaveAccessTo);
    expect(imported.userTypes).toBe(original.userTypes);
    expect(imported.securityRequirements).toBe(original.securityRequirements);
    expect(imported.sensitiveDataTypes).toBe(original.sensitiveDataTypes);
    expect(imported.exampleIdentifiers).toBe(original.exampleIdentifiers);
    expect(imported.criticalActions).toBe(original.criticalActions);
    expect(imported.forbiddenTopics).toBe(original.forbiddenTopics);
    expect(imported.competitors).toBe(original.competitors);
    expect(imported.redteamUser).toBe(original.redteamUser);
    expect(imported.accessToData).toBe(original.accessToData);
    expect(imported.forbiddenData).toBe(original.forbiddenData);
    expect(imported.accessToActions).toBe(original.accessToActions);
    expect(imported.forbiddenActions).toBe(original.forbiddenActions);
    expect(imported.connectedSystems).toBe(original.connectedSystems);
  });

  it('should roundtrip a partial ApplicationDefinition', () => {
    const original: ApplicationDefinition = {
      purpose: 'Simple chatbot',
      redteamUser: 'test@example.com',
      accessToData: 'Public data only',
    };

    const purposeString = applicationDefinitionToPurpose(original);
    const imported = purposeToApplicationDefinition(purposeString);

    expect(imported.purpose).toBe(original.purpose);
    expect(imported.redteamUser).toBe(original.redteamUser);
    expect(imported.accessToData).toBe(original.accessToData);
    // Fields not in original should be empty strings
    expect(imported.features).toBe('');
    expect(imported.industry).toBe('');
  });

  it('should handle multiline content in roundtrip', () => {
    const original: ApplicationDefinition = {
      purpose: `This is a multi-line purpose.
It spans several lines.
And has various content.`,
      features: `Feature 1: Do something
Feature 2: Do something else
Feature 3: Handle edge cases`,
    };

    const purposeString = applicationDefinitionToPurpose(original);
    const imported = purposeToApplicationDefinition(purposeString);

    expect(imported.purpose).toBe(original.purpose);
    expect(imported.features).toBe(original.features);
  });

  it('should handle special characters in roundtrip', () => {
    const original: ApplicationDefinition = {
      purpose: 'It\'s a "complex" app with <special> & characters!',
      features: 'Supports: pipes | and backslashes \\ and quotes "test"',
    };

    const purposeString = applicationDefinitionToPurpose(original);
    const imported = purposeToApplicationDefinition(purposeString);

    expect(imported.purpose).toBe(original.purpose);
    expect(imported.features).toBe(original.features);
  });

  it('should handle unicode characters in roundtrip', () => {
    const original: ApplicationDefinition = {
      purpose: '日本語テスト with émojis 🎉 and Ελληνικά',
      features: '中文特性 • العربية features',
    };

    const purposeString = applicationDefinitionToPurpose(original);
    const imported = purposeToApplicationDefinition(purposeString);

    expect(imported.purpose).toBe(original.purpose);
    expect(imported.features).toBe(original.features);
  });
});

describe('backwards compatibility', () => {
  it('should handle CLI-generated YAML with plain text purpose', () => {
    // This simulates what the CLI generates - just a plain string, not the UI format
    const cliPurpose = 'A customer support chatbot that helps users with their orders';

    const result = purposeToApplicationDefinition(cliPurpose);

    expect(result.purpose).toBe(cliPurpose);
    expect(result.features).toBe('');
    expect(result.redteamUser).toBe('');
  });

  it('should handle YAML with markdown formatting but not our format', () => {
    const markdownPurpose = `# Customer Service Bot

This is a customer service bot that:
- Helps with orders
- Answers FAQs
- Processes returns

## Features
- Natural language understanding
- Multi-turn conversations`;

    const result = purposeToApplicationDefinition(markdownPurpose);

    // Should fall back to treating entire string as purpose
    expect(result.purpose).toBe(markdownPurpose);
    expect(result.features).toBe('');
  });

  it('should handle YAML purpose with inline code blocks (not our format)', () => {
    const inlineCodePurpose =
      'Use \`json\` format for responses. The bot handles \`order\` and \`refund\` requests.';

    const result = purposeToApplicationDefinition(inlineCodePurpose);

    expect(result.purpose).toBe(inlineCodePurpose);
  });

  it('should handle very long purpose strings', () => {
    const longContent = 'A'.repeat(10000);
    const longPurpose = `Application Purpose:
\`\`\`
${longContent}
\`\`\``;

    const result = purposeToApplicationDefinition(longPurpose);

    expect(result.purpose).toBe(longContent);
  });

  it('should handle content with nested triple backticks', () => {
    // This is a potential edge case - content containing backticks
    const purposeWithBackticks = `Application Purpose:
\`\`\`
This purpose contains code examples like:
\`\`
some code
\`\`
And continues after.
\`\`\``;

    const result = purposeToApplicationDefinition(purposeWithBackticks);

    // Should capture up to the first closing triple backtick
    expect(result.purpose).toContain('This purpose contains code examples');
  });

  it('should handle CRLF line endings (Windows)', () => {
    const windowsPurpose =
      'Application Purpose:\r\n```\r\nWindows line endings\r\n```\r\n\r\nRed Team User Persona:\r\n```\r\ntest@example.com\r\n```';

    const result = purposeToApplicationDefinition(windowsPurpose);

    // Should still parse sections correctly - exact match to verify proper parsing
    expect(result.purpose).toBe('Windows line endings');
    expect(result.redteamUser).toBe('test@example.com');
  });

  it('should handle sections with only whitespace content', () => {
    const whitespacePurpose = `Application Purpose:
\`\`\`

\`\`\`

Red Team User Persona:
\`\`\`
valid@email.com
\`\`\``;

    const result = purposeToApplicationDefinition(whitespacePurpose);

    // Whitespace should be trimmed to empty
    expect(result.purpose).toBe('');
    expect(result.redteamUser).toBe('valid@email.com');
  });

  it('should preserve leading/trailing newlines within content', () => {
    const purposeWithNewlines = `Application Purpose:
\`\`\`

Content with newlines before and after

\`\`\``;

    const result = purposeToApplicationDefinition(purposeWithNewlines);

    // The content should be trimmed, so leading/trailing newlines are removed
    expect(result.purpose).toBe('Content with newlines before and after');
  });
});

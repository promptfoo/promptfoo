/**
 * Tests for the recon YAML import logic in page.tsx (lines 408-465)
 * This logic handles importing recon-generated configs with structured metadata.
 */

import { describe, expect, it } from 'vitest';
import { countPopulatedFields } from './utils/applicationDefinition';
import type { Config, ReconContext } from './types';

/**
 * Helper function that mimics the recon YAML import logic from handleFileUpload
 * Extracted for testing purposes - tests the conditional branching and data transformation
 * This represents lines 408-465 of page.tsx
 */
function processReconYamlImport(
  yamlConfig: any,
  mappedConfig: Config,
): {
  updatedConfig: Config;
  reconContext: ReconContext | null;
} {
  // Check if this is a recon-generated config with structured metadata
  const isReconConfig =
    yamlConfig.metadata?.version === 1 && yamlConfig.metadata?.source === 'recon-cli';

  const updatedConfig = { ...mappedConfig };
  let reconContext: ReconContext | null = null;

  // Import structured applicationDefinition from recon metadata if available
  if (isReconConfig && yamlConfig.metadata?.applicationDefinition) {
    const reconAppDef = yamlConfig.metadata.applicationDefinition;
    updatedConfig.applicationDefinition = {
      ...mappedConfig.applicationDefinition,
      purpose: reconAppDef.purpose || mappedConfig.applicationDefinition.purpose,
      features: reconAppDef.features,
      industry: reconAppDef.industry,
      systemPrompt: reconAppDef.systemPrompt,
      hasAccessTo: reconAppDef.hasAccessTo,
      doesNotHaveAccessTo: reconAppDef.doesNotHaveAccessTo,
      userTypes: reconAppDef.userTypes,
      securityRequirements: reconAppDef.securityRequirements,
      sensitiveDataTypes: reconAppDef.sensitiveDataTypes,
      exampleIdentifiers: reconAppDef.exampleIdentifiers,
      criticalActions: reconAppDef.criticalActions,
      forbiddenTopics: reconAppDef.forbiddenTopics,
      attackConstraints: reconAppDef.attackConstraints,
      competitors: reconAppDef.competitors,
      connectedSystems:
        reconAppDef.connectedSystems || mappedConfig.applicationDefinition.connectedSystems,
      redteamUser: reconAppDef.redteamUser || mappedConfig.applicationDefinition.redteamUser,
    };

    // Set stateful flag from recon details if applicable
    if (yamlConfig.metadata?.reconDetails?.stateful) {
      if (typeof updatedConfig.target === 'object') {
        updatedConfig.target.config = { ...updatedConfig.target.config, stateful: true };
      }
    }

    // Import entities from recon details if not already set from redteam config
    if (!updatedConfig.entities?.length && yamlConfig.metadata?.reconDetails?.entities?.length) {
      updatedConfig.entities = yamlConfig.metadata.reconDetails.entities;
    }
  }

  // Set reconContext for recon-generated configs so the banner displays
  if (isReconConfig) {
    const meaningfulFields = countPopulatedFields(updatedConfig.applicationDefinition);
    // Parse generatedAt ISO string to Unix timestamp (ms), fallback to now if invalid
    const generatedAt = yamlConfig.metadata?.generatedAt;
    const timestamp = generatedAt ? new Date(generatedAt).getTime() : Date.now();
    reconContext = {
      source: 'recon-cli',
      timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
      codebaseDirectory: yamlConfig.metadata?.scannedDirectory,
      keyFilesAnalyzed: yamlConfig.metadata?.reconDetails?.keyFiles?.length,
      fieldsPopulated: meaningfulFields,
      discoveredToolsCount: yamlConfig.metadata?.reconDetails?.discoveredTools?.length,
      securityNotes: yamlConfig.metadata?.reconDetails?.securityNotes,
    };
  }

  return { updatedConfig, reconContext };
}

describe('Recon YAML Import Logic', () => {
  const createBaseMappedConfig = (): Config => ({
    description: 'Test Config',
    prompts: ['{{prompt}}'],
    target: { id: 'http', config: {} },
    plugins: ['default'],
    strategies: [],
    purpose: 'Original purpose',
    entities: [],
    numTests: 5,
    maxConcurrency: 10,
    applicationDefinition: {
      purpose: 'Original purpose',
    },
    testGenerationInstructions: '',
  });

  describe('Recon Config Detection', () => {
    it('should detect recon config when metadata has version 1 and source recon-cli', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext).not.toBeNull();
      expect(reconContext?.source).toBe('recon-cli');
    });

    it('should not detect recon config when metadata version is missing', () => {
      const yamlConfig = {
        metadata: {
          source: 'recon-cli',
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext).toBeNull();
    });

    it('should not detect recon config when metadata source is not recon-cli', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'manual',
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext).toBeNull();
    });

    it('should not detect recon config when metadata is missing', () => {
      const yamlConfig = {};
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext).toBeNull();
    });
  });

  describe('Application Definition Import', () => {
    it('should import all applicationDefinition fields from recon metadata', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Medical chatbot',
            features: 'Appointment booking, prescriptions',
            industry: 'Healthcare',
            systemPrompt: 'You are a medical assistant',
            hasAccessTo: 'Patient records, appointments',
            doesNotHaveAccessTo: 'Financial data',
            userTypes: 'Patients, doctors',
            securityRequirements: 'HIPAA compliant',
            sensitiveDataTypes: 'PHI, PII',
            exampleIdentifiers: 'patient_id, medical_record_number',
            criticalActions: 'Prescribe medication',
            forbiddenTopics: 'Financial advice',
            attackConstraints: 'No harmful suggestions',
            competitors: 'Other medical apps',
            connectedSystems: 'EHR system',
            redteamUser: 'test_patient',
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.applicationDefinition.purpose).toBe('Medical chatbot');
      expect(updatedConfig.applicationDefinition.features).toBe(
        'Appointment booking, prescriptions',
      );
      expect(updatedConfig.applicationDefinition.industry).toBe('Healthcare');
      expect(updatedConfig.applicationDefinition.systemPrompt).toBe('You are a medical assistant');
      expect(updatedConfig.applicationDefinition.hasAccessTo).toBe('Patient records, appointments');
      expect(updatedConfig.applicationDefinition.doesNotHaveAccessTo).toBe('Financial data');
      expect(updatedConfig.applicationDefinition.userTypes).toBe('Patients, doctors');
      expect(updatedConfig.applicationDefinition.securityRequirements).toBe('HIPAA compliant');
      expect(updatedConfig.applicationDefinition.sensitiveDataTypes).toBe('PHI, PII');
      expect(updatedConfig.applicationDefinition.exampleIdentifiers).toBe(
        'patient_id, medical_record_number',
      );
      expect(updatedConfig.applicationDefinition.criticalActions).toBe('Prescribe medication');
      expect(updatedConfig.applicationDefinition.forbiddenTopics).toBe('Financial advice');
      expect(updatedConfig.applicationDefinition.attackConstraints).toBe('No harmful suggestions');
      expect(updatedConfig.applicationDefinition.competitors).toBe('Other medical apps');
      expect(updatedConfig.applicationDefinition.connectedSystems).toBe('EHR system');
      expect(updatedConfig.applicationDefinition.redteamUser).toBe('test_patient');
    });

    it('should use original purpose when recon purpose is undefined', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            features: 'Some features',
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.applicationDefinition.purpose = 'Original purpose text';

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.applicationDefinition.purpose).toBe('Original purpose text');
      expect(updatedConfig.applicationDefinition.features).toBe('Some features');
    });

    it('should use original connectedSystems when recon does not provide it', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'New purpose',
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.applicationDefinition.connectedSystems = 'Original system';

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.applicationDefinition.connectedSystems).toBe('Original system');
    });

    it('should use original redteamUser when recon does not provide it', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'New purpose',
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.applicationDefinition.redteamUser = 'original_user';

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.applicationDefinition.redteamUser).toBe('original_user');
    });

    it('should not modify applicationDefinition when recon config lacks applicationDefinition', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
        },
      };
      const mappedConfig = createBaseMappedConfig();
      const originalAppDef = { ...mappedConfig.applicationDefinition };

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.applicationDefinition).toEqual(originalAppDef);
    });
  });

  describe('Stateful Flag Handling', () => {
    it('should set stateful flag on target config when recon details indicate stateful', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            stateful: true,
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.target).toEqual(
        expect.objectContaining({
          config: expect.objectContaining({
            stateful: true,
          }),
        }),
      );
    });

    it('should preserve existing target config when setting stateful', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            stateful: true,
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.target = { id: 'http', config: { url: 'http://example.com', headers: {} } };

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.target).toEqual({
        id: 'http',
        config: {
          url: 'http://example.com',
          headers: {},
          stateful: true,
        },
      });
    });

    it('should not set stateful when recon details stateful is false', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            stateful: false,
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.target.config.stateful).toBeUndefined();
    });

    it('should not modify target when target is a string (edge case)', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            stateful: true,
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      // Edge case: target is string (shouldn't happen in practice due to earlier processing)
      mappedConfig.target = 'http' as any;

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      // Target should remain string, not modified
      expect(updatedConfig.target).toBe('http');
    });
  });

  describe('Entities Import', () => {
    it('should import entities from recon details when config has no entities', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            entities: ['patient_id', 'doctor_name', 'appointment_date'],
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.entities = [];

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.entities).toEqual(['patient_id', 'doctor_name', 'appointment_date']);
    });

    it('should not override existing entities with recon entities', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            entities: ['recon_entity_1', 'recon_entity_2'],
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.entities = ['existing_entity'];

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.entities).toEqual(['existing_entity']);
    });

    it('should not set entities when recon details has no entities', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {},
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.entities = [];

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.entities).toEqual([]);
    });

    it('should not set entities when recon details entities is empty array', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            entities: [],
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.entities).toEqual([]);
    });
  });

  describe('Recon Context Generation', () => {
    it('should generate reconContext with all fields when recon config is valid', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          generatedAt: '2024-01-15T10:30:00.000Z',
          scannedDirectory: '/path/to/codebase',
          applicationDefinition: {
            purpose: 'Test app',
            features: 'Some features',
            systemPrompt: 'System prompt',
          },
          reconDetails: {
            keyFiles: ['file1.ts', 'file2.ts', 'file3.ts'],
            discoveredTools: ['tool1', 'tool2', 'tool3', 'tool4'],
            securityNotes: ['Note 1', 'Note 2'],
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext).not.toBeNull();
      expect(reconContext?.source).toBe('recon-cli');
      expect(reconContext?.timestamp).toBe(new Date('2024-01-15T10:30:00.000Z').getTime());
      expect(reconContext?.codebaseDirectory).toBe('/path/to/codebase');
      expect(reconContext?.keyFilesAnalyzed).toBe(3);
      expect(reconContext?.fieldsPopulated).toBeGreaterThan(0);
      expect(reconContext?.discoveredToolsCount).toBe(4);
      expect(reconContext?.securityNotes).toEqual(['Note 1', 'Note 2']);
    });

    it('should use current timestamp when generatedAt is missing', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
        },
      };
      const mappedConfig = createBaseMappedConfig();
      const beforeTime = Date.now();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      const afterTime = Date.now();
      expect(reconContext?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(reconContext?.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle invalid generatedAt by falling back to current time', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          generatedAt: 'invalid-date-string',
        },
      };
      const mappedConfig = createBaseMappedConfig();
      const beforeTime = Date.now();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      const afterTime = Date.now();
      expect(reconContext?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(reconContext?.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle undefined optional fields in reconContext', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext?.codebaseDirectory).toBeUndefined();
      expect(reconContext?.keyFilesAnalyzed).toBeUndefined();
      expect(reconContext?.discoveredToolsCount).toBeUndefined();
      expect(reconContext?.securityNotes).toBeUndefined();
    });

    it('should count populated fields correctly', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test purpose',
            features: 'Test features',
            systemPrompt: 'Test prompt',
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      // Should count the 3 populated fields
      expect(reconContext?.fieldsPopulated).toBe(3);
    });
  });

  describe('Edge Cases and Complex Scenarios', () => {
    it('should handle recon config with partial applicationDefinition', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Partial purpose',
            industry: 'Healthcare',
            // Other fields missing
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.applicationDefinition.purpose).toBe('Partial purpose');
      expect(updatedConfig.applicationDefinition.industry).toBe('Healthcare');
      expect(updatedConfig.applicationDefinition.features).toBeUndefined();
    });

    it('should handle recon config with all features: applicationDefinition, stateful, entities', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          generatedAt: '2024-01-15T10:30:00.000Z',
          scannedDirectory: '/app',
          applicationDefinition: {
            purpose: 'Full featured app',
            features: 'All features',
            systemPrompt: 'System prompt',
          },
          reconDetails: {
            stateful: true,
            entities: ['entity1', 'entity2'],
            keyFiles: ['a.ts', 'b.ts'],
            discoveredTools: ['tool1'],
            securityNotes: ['Note'],
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.entities = [];

      const { updatedConfig, reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      // All features should be applied
      expect(updatedConfig.applicationDefinition.purpose).toBe('Full featured app');
      expect(updatedConfig.target.config.stateful).toBe(true);
      expect(updatedConfig.entities).toEqual(['entity1', 'entity2']);
      expect(reconContext).not.toBeNull();
      expect(reconContext?.fieldsPopulated).toBe(3);
    });

    it('should handle non-recon config gracefully', () => {
      const yamlConfig = {
        // No metadata or wrong format
        redteam: {
          purpose: 'Regular config',
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { updatedConfig, reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      // Should not modify config
      expect(updatedConfig).toEqual(mappedConfig);
      expect(reconContext).toBeNull();
    });

    it('should handle empty recon metadata', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          // All optional fields missing
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext).not.toBeNull();
      expect(reconContext?.source).toBe('recon-cli');
      expect(reconContext?.fieldsPopulated).toBe(1); // Only purpose from original
    });

    it('should handle nested undefined properties gracefully', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: 'Test',
          },
          reconDetails: {
            // All properties undefined
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { updatedConfig, reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      // Should not throw, should handle gracefully
      expect(updatedConfig).toBeDefined();
      expect(reconContext).toBeDefined();
      expect(reconContext?.keyFilesAnalyzed).toBeUndefined();
      expect(reconContext?.discoveredToolsCount).toBeUndefined();
    });

    it('should preserve original config when recon metadata applicationDefinition has undefined fields', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          applicationDefinition: {
            purpose: undefined,
            features: 'New features',
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();
      mappedConfig.applicationDefinition.purpose = 'Original purpose';

      const { updatedConfig } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(updatedConfig.applicationDefinition.purpose).toBe('Original purpose');
      expect(updatedConfig.applicationDefinition.features).toBe('New features');
    });
  });

  describe('Data Type Handling', () => {
    it('should handle numeric values in reconDetails correctly', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          reconDetails: {
            keyFiles: ['a', 'b'],
            discoveredTools: ['t1', 't2', 't3'],
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext?.keyFilesAnalyzed).toBe(2);
      expect(reconContext?.discoveredToolsCount).toBe(3);
    });

    it('should handle undefined length properties', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          reconDetails: {
            keyFiles: undefined,
            discoveredTools: undefined,
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext?.keyFilesAnalyzed).toBeUndefined();
      expect(reconContext?.discoveredToolsCount).toBeUndefined();
    });

    it('should handle zero-length arrays', () => {
      const yamlConfig = {
        metadata: {
          version: 1,
          source: 'recon-cli',
          reconDetails: {
            keyFiles: [],
            discoveredTools: [],
            securityNotes: [],
          },
        },
      };
      const mappedConfig = createBaseMappedConfig();

      const { reconContext } = processReconYamlImport(yamlConfig, mappedConfig);

      expect(reconContext?.keyFilesAnalyzed).toBe(0);
      expect(reconContext?.discoveredToolsCount).toBe(0);
      expect(reconContext?.securityNotes).toEqual([]);
    });
  });
});

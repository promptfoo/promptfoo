/**
 * Shared types for test case generation.
 *
 * This file exists to prevent circular dependencies between:
 * - TestCaseGenerationProvider.tsx (defines context and provider)
 * - TestCaseDialog.tsx (consumes these types)
 *
 * By extracting shared types to this separate file, both modules can import
 * from here without creating import cycles.
 */

import type { Plugin, Strategy } from '@promptfoo/redteam/constants';
import type { PluginConfig, StrategyConfig } from '@promptfoo/redteam/types';

export interface GeneratedTestCase {
  prompt: string;
  context?: string;
  metadata?: unknown;
}

export interface TargetResponse {
  output: string | null;
  error: string | null;
}

export interface TargetPlugin {
  id: Plugin;
  config: PluginConfig;
  isStatic: boolean;
}

export interface TargetStrategy {
  id: Strategy;
  config: StrategyConfig;
  isStatic: boolean;
}

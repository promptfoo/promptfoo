import { analyzeMetamorphic } from './analyze';
import { inspectNative } from './inspect';
import { renderInspection } from './inspectRender';
import { parsePlan } from './plan';
import { renderPlanSummary, summarizePlan } from './planSummary';
import { renderReport } from './render';

/** Native-export analysis utilities. None of these functions invokes a provider. */
export const metamorphic = {
  analyze: analyzeMetamorphic,
  inspect: inspectNative,
  parsePlan,
  summarizePlan,
  renderReport,
  renderInspection,
  renderPlanSummary,
};
export type { ContextInventory, NativeInspection, VariantInventory } from './inspectionTypes';
export type {
  AnalysisLimits,
  CheckResult,
  MetamorphicPlan,
  MetamorphicReport,
  ObservationEvidence,
  PanelSummary,
  RelationSummary,
} from './types';

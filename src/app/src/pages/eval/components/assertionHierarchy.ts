/**
 * Minimal recursive grading-result shape required by the assertion hierarchy UI.
 * Keeping this view model local avoids coupling presentation components to the
 * legacy root type bundle.
 */
export interface AssertionHierarchyResult {
  assertion?: {
    metric?: string;
    threshold?: number;
    type?: string;
  };
  componentResults?: Array<AssertionHierarchyResult | null | undefined>;
  metadata?: {
    assertSetMetric?: string;
    assertSetThreshold?: number;
    isAssertSet?: boolean;
    parentAssertSetIndex?: number;
  };
  pass: boolean;
  reason: string;
  score: number;
}

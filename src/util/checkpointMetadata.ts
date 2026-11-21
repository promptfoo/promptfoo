/** Bound imported checkpoint trees before recursive projection or media IO. */
export function assertCheckpointBounds(metadata: unknown): void {
  let remainingTargets = 10_000;
  function visit(value: unknown, depth: number) {
    const record = value as Record<string, unknown> | null | undefined;
    if (record?.interruptedStrategy !== true || !Array.isArray(record.completedTargetResponses)) {
      return;
    }
    remainingTargets -= record.completedTargetResponses.length;
    if (depth > 32 || remainingTargets < 0) {
      throw new Error('Interrupted checkpoint exceeds the nesting or target limit');
    }
    for (const entry of record.completedTargetResponses) {
      visit(entry?.response?.metadata, depth + 1);
    }
  }
  visit(metadata, 1);
}

// This assertion checks curated fixture metadata, not real-world legal status.
module.exports = (output, context) => {
  const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });
  let answer;
  try {
    answer = JSON.parse(output);
  } catch {
    return result(false, 'Answer is not JSON');
  }
  const { as_of: asOf, entity_id: entityId, list_id: listId, sources } = context.vars;
  if (
    !answer ||
    typeof answer !== 'object' ||
    !['present', 'absent', 'cannot_verify'].includes(answer.status) ||
    answer.as_of !== asOf ||
    !Array.isArray(answer.citation_ids) ||
    answer.citation_ids.some((id) => typeof id !== 'string') ||
    new Set(answer.citation_ids).size !== answer.citation_ids.length ||
    !Array.isArray(sources)
  ) {
    return result(false, 'Answer shape, date, or citation identifiers are invalid');
  }

  const cited = answer.citation_ids.map((id) => sources.find((source) => source.id === id));
  if (cited.some((source) => source === undefined)) {
    return result(false, 'Answer cites a source outside the supplied evidence');
  }

  // A historical notice is not a complete membership snapshot. Require the
  // exact list, date, and identifier before using a snapshot for this exercise.
  const snapshots = cited.filter(
    (source) =>
      source.kind === 'snapshot' &&
      source.list_id === listId &&
      source.snapshot_date === asOf &&
      source.entity_id === entityId &&
      source.complete === true &&
      typeof source.member === 'boolean',
  );
  const outcomes = new Set(snapshots.map((source) => (source.member ? 'present' : 'absent')));
  const expected = outcomes.size === 1 ? [...outcomes][0] : 'cannot_verify';
  return result(
    answer.status === expected,
    `Cited fixture evidence supports ${expected}; answer says ${answer.status}`,
  );
};

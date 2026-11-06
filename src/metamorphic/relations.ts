import { canonicalJson } from './values';

import type { WorkBudget } from './limits';
import type { JsonValue, Relation, RelationResult, Selection } from './types';

function decided(satisfied: boolean): RelationResult {
  return {
    verdict: satisfied ? 'pass' : 'fail',
    reason: satisfied ? 'relation-satisfied' : 'relation-violated',
  };
}
function mismatch(): RelationResult {
  return { verdict: 'inconclusive', reason: 'value-type-mismatch' };
}
function numeric(relation: Relation, left: JsonValue, right: JsonValue): RelationResult {
  if (typeof left !== 'number' || typeof right !== 'number') {
    return mismatch();
  }
  if (relation.kind === 'nondecreasing') {
    return decided(right >= left);
  }
  if (relation.kind === 'nonincreasing') {
    return decided(right <= left);
  }
  if (relation.kind !== 'affine') {
    throw new Error('Invalid numeric relation dispatch');
  }
  const product = left * relation.scale;
  const expected = product + relation.offset;
  const tolerance =
    relation.absoluteTolerance +
    relation.relativeTolerance * Math.max(Math.abs(expected), Math.abs(right));
  const difference = Math.abs(right - expected);
  if (![product, expected, tolerance, difference].every(Number.isFinite)) {
    return { verdict: 'inconclusive', reason: 'numeric-overflow' };
  }
  return decided(difference <= tolerance);
}
function arrays(
  relation: Relation,
  left: JsonValue,
  right: JsonValue,
  work: WorkBudget,
): RelationResult {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return mismatch();
  }
  const leftKeys = left.map((item) => canonicalJson(item, work));
  const rightKeys = right.map((item) => canonicalJson(item, work));
  const cardinality: NonNullable<RelationResult['cardinality']> = {
    left: left.length,
    right: right.length,
  };
  let satisfied: boolean;
  if (relation.kind === 'prefix') {
    satisfied =
      leftKeys.length <= rightKeys.length &&
      leftKeys.every((key, index) => {
        work.spend();
        return key === rightKeys[index];
      });
  } else if (relation.kind === 'subsequence') {
    let position = 0;
    for (const key of rightKeys) {
      work.spend();
      if (position < leftKeys.length && leftKeys[position] === key) {
        position += 1;
      }
    }
    satisfied = position === leftKeys.length;
  } else {
    const leftSet = new Set(leftKeys);
    const rightSet = new Set(rightKeys);
    cardinality.leftUnique = leftSet.size;
    cardinality.rightUnique = rightSet.size;
    const subset = (a: Set<string>, b: Set<string>): boolean => {
      for (const key of a) {
        work.spend();
        if (!b.has(key)) {
          return false;
        }
      }
      return true;
    };
    switch (relation.kind) {
      case 'set-equal':
        satisfied = leftSet.size === rightSet.size && subset(leftSet, rightSet);
        break;
      case 'subset':
        satisfied = subset(leftSet, rightSet);
        break;
      case 'superset':
        satisfied = subset(rightSet, leftSet);
        break;
      case 'disjoint':
        satisfied = !leftKeys.some((key) => {
          work.spend();
          return rightSet.has(key);
        });
        break;
      default:
        throw new Error('Invalid array relation dispatch');
    }
  }
  return { ...decided(satisfied), cardinality };
}

/** Direction is always left -> right. No coercion or semantic judge is applied. */
export function evaluateRelation(
  relation: Relation,
  left: Selection,
  right: Selection,
  work: WorkBudget,
): RelationResult {
  if (!left.available) {
    return { verdict: 'inconclusive', reason: left.reason };
  }
  if (!right.available) {
    return { verdict: 'inconclusive', reason: right.reason };
  }
  switch (relation.kind) {
    case 'equal':
      return decided(canonicalJson(left.value, work) === canonicalJson(right.value, work));
    case 'not-equal':
      return decided(canonicalJson(left.value, work) !== canonicalJson(right.value, work));
    case 'affine':
    case 'nondecreasing':
    case 'nonincreasing':
      return numeric(relation, left.value, right.value);
    case 'set-equal':
    case 'subset':
    case 'superset':
    case 'disjoint':
    case 'prefix':
    case 'subsequence':
      return arrays(relation, left.value, right.value, work);
  }
}

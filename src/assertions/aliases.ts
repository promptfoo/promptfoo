import { AssertionAliasesSchema, isReservedAssertionAliasLabel } from '../types/index';

import type {
  Assertion,
  AssertionAlias,
  AssertionOrSet,
  AssertionSet,
  TestCase,
} from '../types/index';

type ResolvedAssertionAlias = {
  type: AssertionAlias['type'];
  script: string;
  value: Assertion['value'];
};

const resolvedAssertionAlias = Symbol('resolvedAssertionAlias');

type AssertionWithAlias = Assertion & {
  [resolvedAssertionAlias]?: ResolvedAssertionAlias;
};

function createAliasMap(aliases: AssertionAlias[]): Map<string, AssertionAlias> {
  const aliasesByLabel = new Map<string, AssertionAlias>();

  for (const alias of aliases) {
    if (aliasesByLabel.has(alias.label)) {
      throw new Error(`Duplicate assertion alias label: ${alias.label}`);
    }
    if (isReservedAssertionAliasLabel(alias.label)) {
      throw new Error(
        `Assertion alias label conflicts with built-in assertion type: ${alias.label}`,
      );
    }
    aliasesByLabel.set(alias.label, alias);
  }

  return aliasesByLabel;
}

function resolveAssertion(
  assertion: AssertionOrSet,
  aliasesByLabel: Map<string, AssertionAlias>,
): AssertionOrSet {
  if (assertion.type === 'assert-set') {
    return {
      ...assertion,
      assert: assertion.assert.map((childAssertion) =>
        resolveAssertion(childAssertion, aliasesByLabel),
      ) as AssertionSet['assert'],
    };
  }

  const alias = aliasesByLabel.get(assertion.type);
  if (!alias) {
    return assertion;
  }

  return Object.defineProperty({ ...assertion }, resolvedAssertionAlias, {
    value: {
      type: alias.type,
      script: alias.script,
      value: assertion.value,
    },
  }) as AssertionWithAlias;
}

export function resolveAssertionAliases<T extends Pick<TestCase, 'assert'>>(
  tests: T[],
  aliases: AssertionAlias[] | undefined,
): T[] {
  if (!aliases?.length) {
    return tests;
  }

  const aliasesByLabel = createAliasMap(AssertionAliasesSchema.parse(aliases));
  return tests.map((test) => {
    if (!test.assert) {
      return test;
    }
    return {
      ...test,
      assert: test.assert.map((assertion) => resolveAssertion(assertion, aliasesByLabel)),
    };
  });
}

export function getResolvedAssertionAlias(
  assertion: Assertion,
): ResolvedAssertionAlias | undefined {
  return (assertion as AssertionWithAlias)[resolvedAssertionAlias];
}

export function copyResolvedAssertionAlias<T extends AssertionOrSet>(source: T, target: T): T {
  if (source.type === 'assert-set') {
    return target;
  }

  const alias = getResolvedAssertionAlias(source);
  return alias
    ? (Object.defineProperty(target, resolvedAssertionAlias, { value: alias }) as T)
    : target;
}

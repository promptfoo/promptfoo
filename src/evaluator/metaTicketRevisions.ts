import cliState from '../cliState';
import { getExtensionHookName } from '../evaluatorHelpers';
import logger from '../logger';
import { hasMetaTicketRevision, proposeMetaTicketRevision } from '../redteam/metaTicketRevision';
import { isApiProvider } from '../types/providers';
import { promptUsesConversationVariable } from './runEval';

import type { AtomicTestCase, EvaluateResult, RunEvalOptions } from '../types/index';

type Decision = 'proposed' | 'ineligible' | 'unsupported' | 'proposal-failed' | 'aborted';

// The setup UI's only transform assigns a new client session. It normally
// runs once before column and repeat expansion. Rotate its ID per dispatch
// without executing any transform on the replacement ticket.
const clientSessionTransform = '{ ...vars, sessionId: context.uuid }';

function freshClientSession(test: AtomicTestCase): AtomicTestCase {
  return test.options?.transformVars === clientSessionTransform
    ? { ...test, vars: { ...test.vars, sessionId: crypto.randomUUID() } }
    : test;
}

function supportsRevision(step: RunEvalOptions): boolean {
  const { test } = step;
  const provider = isApiProvider(test.provider) ? test.provider : step.provider;
  const stateful = [provider.config, step.prompt.config, test.options].some(
    (config) =>
      config &&
      [
        'persistSession',
        'persist_threads',
        'thread_id',
        'session_id',
        'sessionId',
        'previous_response_id',
        'conversation',
        'continue',
        'resume',
      ].some((key) => Boolean(config[key])),
  );
  // Post-scan comparisons don't have a final grade yet. Shared state or hooks can
  // change the owner or carry private history into what must be a fresh trial.
  return !(
    cliState.resume ||
    cliState.retryMode ||
    test.assert?.some(({ type }) => type === 'select-best' || type === 'max-score') ||
    step.testSuite?.extensions?.some((extension) => {
      const hook = getExtensionHookName(extension);
      return hook !== 'beforeAll' && hook !== 'afterAll';
    }) ||
    ((test.options?.transformVars || test.vars?.sessionId) &&
      test.options?.transformVars !== clientSessionTransform) ||
    test.options?.storeOutputAs ||
    test.metadata?.conversationId ||
    promptUsesConversationVariable(step.prompt) ||
    test.vars?._conversation ||
    stateful
  );
}

/** A bounded second wave of independently graded rows. Only initial dispatches can propose. */
export class MetaTicketRevisions {
  private readonly seeds = new Map<number, boolean>();
  private readonly children = new Map<number, RunEvalOptions>();
  private nextTestIdx = 0;

  constructor(
    steps: RunEvalOptions[],
    readonly signal: AbortSignal,
  ) {
    for (const [index, step] of steps.entries()) {
      this.nextTestIdx = Math.max(this.nextTestIdx, step.testIdx + 1);
      if (step.test.metadata?.agentOutcome?.metaTicketRevision && hasMetaTicketRevision(step)) {
        const supported = supportsRevision(step);
        if (supported) {
          step.test = freshClientSession(step.test);
          step.registers = {};
        }
        this.seeds.set(index, supported);
      }
    }
  }

  get enabled() {
    return this.seeds.size > 0;
  }

  async decide(index: number, step: RunEvalOptions, row: EvaluateResult, singleRow: boolean) {
    const supported = this.seeds.get(index);
    if (supported === undefined) {
      return;
    }

    let decision: Decision;
    if (!supported || !singleRow || this.children.has(index)) {
      decision = 'unsupported';
    } else if (this.signal.aborted) {
      decision = 'aborted';
    } else {
      try {
        const test = await proposeMetaTicketRevision(step, row, this.signal);
        if (this.signal.aborted) {
          decision = 'aborted';
        } else if (test) {
          decision = 'proposed';
          this.children.set(index, {
            ...step,
            test: freshClientSession(test),
            // Each proposal can differ, even across columns and repeats of one
            // seed. Don't pool it with the repeats or forward shared state.
            repeatGroupId: undefined,
            conversations: {},
            registers: {},
          });
        } else {
          decision = 'ineligible';
        }
      } catch {
        decision = this.signal.aborted ? 'aborted' : 'proposal-failed';
        if (decision === 'proposal-failed') {
          logger.warn('Meta ticket proposal failed. Keeping the graded seed without a revision.');
        }
      }
    }
    // Record a decision even when the proposal failed. 'proposed' doesn't imply
    // dispatch. Only the separately persisted row with parentCaseId does.
    row.metadata = { ...row.metadata, metaTicketRevisionDecision: decision };
    return decision === 'proposed';
  }

  ready(parentSaved: (index: number) => boolean): RunEvalOptions[] {
    const steps: RunEvalOptions[] = [];
    for (const index of this.seeds.keys()) {
      const child = this.children.get(index);
      if (child && parentSaved(index)) {
        steps.push({ ...child, testIdx: this.nextTestIdx++ });
      }
    }
    this.children.clear();
    return steps;
  }
}

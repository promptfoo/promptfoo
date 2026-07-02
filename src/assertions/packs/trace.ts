import { handleSkillUsed } from '../skill';
import { handleTraceErrorSpans } from '../traceErrorSpans';
import { handleTraceSpanCount } from '../traceSpanCount';
import { handleTraceSpanDuration } from '../traceSpanDuration';
import {
  handleTrajectoryGoalSuccess,
  handleTrajectoryStepCount,
  handleTrajectoryToolArgsMatch,
  handleTrajectoryToolSequence,
  handleTrajectoryToolUsed,
} from '../trajectory';

import type { AssertionCapabilityPack } from '../registryTypes';

export const traceAssertionPack = {
  name: 'trace',
  handlers: {
    'skill-used': handleSkillUsed,
    'trace-error-spans': handleTraceErrorSpans,
    'trace-span-count': handleTraceSpanCount,
    'trace-span-duration': handleTraceSpanDuration,
    'trajectory:goal-success': handleTrajectoryGoalSuccess,
    'trajectory:step-count': handleTrajectoryStepCount,
    'trajectory:tool-args-match': handleTrajectoryToolArgsMatch,
    'trajectory:tool-sequence': handleTrajectoryToolSequence,
    'trajectory:tool-used': handleTrajectoryToolUsed,
  },
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleSkillUsed>[0],
  Awaited<ReturnType<typeof handleSkillUsed>>
>;

type Flag = 'EVAL_RESULTS_MULTI_FILTERING';

export const useFeatureFlag = (flag: Flag) => {
  const flagId = `FEATURE_ENABLED__${flag}`;
  return import.meta.env[flagId];
};

// No feature flags currently in use
type Flag = never;

export const useFeatureFlag = (flag: Flag) => {
  const flagId = `FEATURE_ENABLED__${flag}`;
  return import.meta.env[flagId];
};

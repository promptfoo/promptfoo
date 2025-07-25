// No feature flags currently in use
type Flag = never;

export const useFeatureFlag = (flag: Flag): boolean => {
  // This function is kept for future use when feature flags are added
  // The improved implementation directly returns boolean values with nullish coalescing
  // to avoid the previous bug where JSON.stringify converted false to "false" string
  return false;
};

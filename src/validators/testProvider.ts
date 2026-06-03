/**
 * @deprecated Import provider validation helpers from `src/node/testProvider`.
 * This compatibility surface remains for existing internal and programmatic callers.
 */
export {
  type ProviderTestResult,
  type SessionTestResult,
  testProviderConnectivity,
  testProviderSession,
} from '../node/testProvider';

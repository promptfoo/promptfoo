import { getEnvBool, getEnvString } from '../../envars';
import { isFipsEnabled } from '../fips';

export function assertFipsTlsVerification(rejectUnauthorized?: boolean): void {
  if (!isFipsEnabled()) {
    return;
  }
  if (
    rejectUnauthorized === false ||
    getEnvBool('PROMPTFOO_INSECURE_SSL', false) ||
    getEnvString('NODE_TLS_REJECT_UNAUTHORIZED') === '0' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
  ) {
    throw new Error(
      'FIPS mode requires TLS certificate verification. Remove insecure TLS overrides and configure a trusted CA certificate instead.',
    );
  }
}

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { getAuthor } from './accounts';
import logger from './logger';

if (process.env.PROMPTFOO_ENABLE_ERROR_REPORTING) {
  Sentry.init({
    dsn: process.env.PROMPTFOO_SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
  if (Sentry.isInitialized()) {
    logger.info('Error reporting enabled.');
  }
  const author = getAuthor();
  if (author) {
    Sentry.setUser({ email: author });
  }
}

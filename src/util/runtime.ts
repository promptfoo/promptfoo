import { TERMINAL_MAX_WIDTH } from '../constants';
import logger from '../logger';

export function printBorder() {
  const border = '='.repeat(TERMINAL_MAX_WIDTH);
  logger.info(border);
}

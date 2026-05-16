import * as path from 'path';

import { OutputFileExtension } from '../types';

export const JUNIT_XML_OUTPUT_SUFFIX = '.junit.xml';

export type OutputFileFormat = OutputFileExtension | 'junit.xml';

export const SUPPORTED_OUTPUT_FILE_FORMATS = [...OutputFileExtension.options, 'junit.xml'] as const;

export function getOutputFileFormat(outputPath: string): OutputFileFormat | undefined {
  if (outputPath.toLowerCase().endsWith(JUNIT_XML_OUTPUT_SUFFIX)) {
    return 'junit.xml';
  }

  return OutputFileExtension.safeParse(path.extname(outputPath).slice(1).toLowerCase()).data;
}

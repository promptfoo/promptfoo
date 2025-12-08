import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { getEnvBool } from '../envars';
import { importModule } from '../esm';
import {
  detectMimeFromBase64,
  extractTextFromPDF,
  getMimeTypeFromExtension,
} from '../evaluatorHelpers';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import telemetry from '../telemetry';
import { isAudioFile, isImageFile, isJavascriptFile, isVideoFile } from './fileExtensions';
import { parseFileUrl } from './functions/loadFunction';

/**
 * Loads the content from a file reference
 * @param fileRef The file reference string (e.g. 'file://path/to/file.json')
 * @param basePath Base path for resolving relative paths
 * @returns The loaded content from the file
 */
export async function loadFileReference(fileRef: string, basePath: string = ''): Promise<any> {
  // Parse file:// URL with Windows-aware path handling
  const { filePath, functionName } = parseFileUrl(fileRef);

  // Resolve the absolute path
  const resolvedPath = path.resolve(basePath, filePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  logger.debug(
    `Loading file reference: ${fileRef}, resolvedPath: ${resolvedPath}, extension: ${extension}`,
  );

  try {
    if (extension === '.json') {
      logger.debug(`Loading JSON file: ${resolvedPath}`);
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      return JSON.parse(content);
    } else if (extension === '.yaml' || extension === '.yml') {
      // Return JSON string to match top-level behavior in evaluatorHelpers
      logger.debug(`Loading YAML file: ${resolvedPath}`);
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      return JSON.stringify(yaml.load(content) as string | object);
    } else if (isJavascriptFile(resolvedPath)) {
      // Note: Unlike top-level JS vars, nested JS files don't receive context (varName, basePrompt, vars, provider)
      logger.debug(`Loading JavaScript file: ${resolvedPath}`);
      const mod = await importModule(resolvedPath, functionName);
      return typeof mod === 'function' ? await mod() : mod;
    } else if (extension === '.py') {
      // Note: Unlike top-level Python vars, nested Python files use get_config and don't receive context
      logger.debug(
        `Loading Python file: ${resolvedPath}, function: ${functionName || 'get_config'}`,
      );
      const fnName = functionName || 'get_config';
      const result = await runPython(resolvedPath, fnName, []);
      return result;
    } else if (extension === '.pdf' && !getEnvBool('PROMPTFOO_DISABLE_PDF_AS_TEXT')) {
      logger.debug(`Loading PDF file: ${resolvedPath}`);
      telemetry.record('feature_used', {
        feature: 'extract_text_from_pdf',
      });
      return await extractTextFromPDF(resolvedPath);
    } else if (
      (isImageFile(resolvedPath) || isVideoFile(resolvedPath) || isAudioFile(resolvedPath)) &&
      !getEnvBool('PROMPTFOO_DISABLE_MULTIMEDIA_AS_BASE64')
    ) {
      const fileType = isImageFile(resolvedPath)
        ? 'image'
        : isVideoFile(resolvedPath)
          ? 'video'
          : 'audio';

      telemetry.record('feature_used', {
        feature: `load_${fileType}_as_base64`,
      });

      logger.debug(`Loading ${fileType} file as base64: ${resolvedPath}`);
      const fileBuffer = await fs.promises.readFile(resolvedPath);
      const base64Data = fileBuffer.toString('base64');

      if (fileType === 'image') {
        // For images, generate data URL with proper MIME type
        // Use extension first, then magic number detection for accuracy
        let mimeType = getMimeTypeFromExtension(extension);
        const extensionWasUnknown = !extension || mimeType === 'image/jpeg';

        // For better accuracy, use magic number detection
        const detectedType = detectMimeFromBase64(base64Data);
        if (detectedType) {
          // Use detected type if available and different from extension-based guess
          if (detectedType !== mimeType) {
            logger.debug(
              `Magic number detection overriding extension-based MIME type: ${detectedType} (was ${mimeType}) for ${resolvedPath}`,
            );
            mimeType = detectedType;
          }
        } else if (extensionWasUnknown) {
          // Could not detect format and extension was unknown/ambiguous
          logger.warn(
            `Could not detect image format for ${resolvedPath}, defaulting to image/jpeg. Supported formats: JPEG, PNG, GIF, WebP, BMP, TIFF, ICO, AVIF, HEIC, SVG`,
          );
        }

        return `data:${mimeType};base64,${base64Data}`;
      } else {
        // Keep existing behavior for video/audio files (raw base64)
        return base64Data;
      }
    } else {
      // For any other files (including .txt, .md, or unknown), read as text
      // Use trim() to match top-level behavior in evaluatorHelpers
      logger.debug(`Loading file as text: ${resolvedPath}`);
      return (await fs.promises.readFile(resolvedPath, 'utf8')).trim();
    }
  } catch (error) {
    logger.error(`Error loading file reference ${fileRef}: ${error}`);
    throw error;
  }
}

/**
 * Recursively processes a configuration object, replacing any file:// references
 * with the content of the referenced files
 * @param config The configuration object to process
 * @param basePath Base path for resolving relative paths
 * @returns A new configuration object with file references resolved
 */
export async function processConfigFileReferences(
  config: any,
  basePath: string = '',
): Promise<any> {
  if (!config) {
    return config;
  }

  // Handle string values with file:// protocol
  if (typeof config === 'string' && config.startsWith('file://')) {
    return await loadFileReference(config, basePath);
  }

  // Handle arrays
  if (Array.isArray(config)) {
    const result = [];
    for (const item of config) {
      result.push(await processConfigFileReferences(item, basePath));
    }
    return result;
  }

  // Handle objects
  if (typeof config === 'object' && config !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = await processConfigFileReferences(value, basePath);
    }
    return result;
  }

  // Return primitive values as is
  return config;
}

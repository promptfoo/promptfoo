import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { getEnvBool } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import telemetry from '../telemetry';
import { detectMimeFromBase64, extractTextFromPDF, getMimeTypeFromExtension } from './file';
import { isAudioFile, isImageFile, isJavascriptFile, isVideoFile } from './fileExtensions';
import { parseFileUrl } from './functions/loadFunction';

async function loadStructuredFile(resolvedPath: string, extension: string): Promise<any> {
  logger.debug(`Loading ${extension.slice(1).toUpperCase()} file: ${resolvedPath}`);
  const content = await fs.promises.readFile(resolvedPath, 'utf8');
  if (extension === '.json') {
    return JSON.parse(content);
  }
  return JSON.stringify(yaml.load(content) as string | object);
}

async function loadScriptFile(resolvedPath: string, functionName?: string): Promise<any> {
  if (isJavascriptFile(resolvedPath)) {
    logger.debug(`Loading JavaScript file: ${resolvedPath}`);
    const mod = await importModule(resolvedPath, functionName);
    return typeof mod === 'function' ? await mod() : mod;
  }

  logger.debug(`Loading Python file: ${resolvedPath}, function: ${functionName || 'get_config'}`);
  return runPython(resolvedPath, functionName || 'get_config', []);
}

function getMediaFileType(resolvedPath: string): 'image' | 'video' | 'audio' | undefined {
  if (isImageFile(resolvedPath)) {
    return 'image';
  }
  if (isVideoFile(resolvedPath)) {
    return 'video';
  }
  if (isAudioFile(resolvedPath)) {
    return 'audio';
  }
}

function getImageMimeType(extension: string, base64Data: string, resolvedPath: string): string {
  const mimeType = getMimeTypeFromExtension(extension);
  const extensionWasUnknown = !extension || mimeType === 'image/jpeg';
  const detectedType = detectMimeFromBase64(base64Data);

  if (detectedType && detectedType !== mimeType) {
    logger.debug(
      `Magic number detection overriding extension-based MIME type: ${detectedType} (was ${mimeType}) for ${resolvedPath}`,
    );
    return detectedType;
  }

  if (!detectedType && extensionWasUnknown) {
    logger.warn(
      `Could not detect image format for ${resolvedPath}, defaulting to image/jpeg. Supported formats: JPEG, PNG, GIF, WebP, BMP, TIFF, ICO, AVIF, HEIC, SVG`,
    );
  }

  return mimeType;
}

async function loadMediaFile(
  resolvedPath: string,
  extension: string,
  fileType: 'image' | 'video' | 'audio',
): Promise<string> {
  telemetry.record('feature_used', {
    feature: `load_${fileType}_as_base64`,
  });

  logger.debug(`Loading ${fileType} file as base64: ${resolvedPath}`);
  const fileBuffer = await fs.promises.readFile(resolvedPath);
  const base64Data = fileBuffer.toString('base64');

  if (fileType !== 'image') {
    return base64Data;
  }

  return `data:${getImageMimeType(extension, base64Data, resolvedPath)};base64,${base64Data}`;
}

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
    if (extension === '.json' || extension === '.yaml' || extension === '.yml') {
      return await loadStructuredFile(resolvedPath, extension);
    }
    if (isJavascriptFile(resolvedPath) || extension === '.py') {
      return await loadScriptFile(resolvedPath, functionName);
    }
    if (extension === '.pdf' && !getEnvBool('PROMPTFOO_DISABLE_PDF_AS_TEXT')) {
      logger.debug(`Loading PDF file: ${resolvedPath}`);
      telemetry.record('feature_used', {
        feature: 'extract_text_from_pdf',
      });
      return await extractTextFromPDF(resolvedPath);
    }
    const mediaType = getMediaFileType(resolvedPath);
    if (mediaType && !getEnvBool('PROMPTFOO_DISABLE_MULTIMEDIA_AS_BASE64')) {
      return await loadMediaFile(resolvedPath, extension, mediaType);
    }

    logger.debug(`Loading file as text: ${resolvedPath}`);
    return (await fs.promises.readFile(resolvedPath, 'utf8')).trim();
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
  if (config === null || config === undefined) {
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
  if (typeof config === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = await processConfigFileReferences(value, basePath);
    }
    return result;
  }

  // Return primitive values as is
  return config;
}

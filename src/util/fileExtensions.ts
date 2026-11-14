// Compatibility shim for existing source consumers. Import new code from validation/fileExtensions.
export {
  isAudioFile,
  isImageFile,
  isJavascriptFile,
  isPythonFile,
  isVideoFile,
  JAVASCRIPT_EXTENSIONS,
  normalizeWindowsFileUrlPath,
  parseExecutableFileReference,
  parsePythonFileReference,
  parseRubyFileReference,
} from '../validation/fileExtensions';

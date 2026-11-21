// Compatibility shim for existing source consumers. Import new code from validation/fileExtensions.
export {
  isAudioFile,
  isImageFile,
  isJavascriptFile,
  isVideoFile,
  JAVASCRIPT_EXTENSIONS,
  parseFileUrl,
} from '../validation/fileExtensions';

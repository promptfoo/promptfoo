// Export utility functions from the legacy pythonUtils
export {
  state,
  getSysExecutable,
  tryPath,
  validatePythonPath,
} from './pythonUtils.legacy';

// Export the original runPython as runPythonLegacy for backward compatibility
export { runPython as runPythonLegacy } from './pythonUtils.legacy';

// Export the new smart runner as the main runPython function
export { runPython } from './pythonRunner';
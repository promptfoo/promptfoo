// Capture before configuration can load project files. Other commands and
// library users do not need a persistent copy of the launch environment.
const initialProcessEnvironment = process.argv.slice(2).includes('update')
  ? { ...process.env }
  : {};

export function getInitialProcessEnvironment(): NodeJS.ProcessEnv {
  return { ...initialProcessEnvironment };
}

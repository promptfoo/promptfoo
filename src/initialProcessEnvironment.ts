const initialProcessEnvironment = { ...process.env };

export function getInitialProcessEnvironment(): NodeJS.ProcessEnv {
  return { ...initialProcessEnvironment };
}

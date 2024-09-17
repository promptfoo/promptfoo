// Behavior varies depending on whether the app is running as a static HTML app on the user's local machine.
export const IS_RUNNING_LOCALLY = !import.meta.env.VITE_IS_HOSTED;

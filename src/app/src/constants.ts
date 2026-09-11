// Behavior varies depending on whether the app is running as a static HTML app on the user's local machine.
export const IS_RUNNING_LOCALLY = !import.meta.env.VITE_IS_HOSTED;

// Metadata keys that should be hidden from the user in the UI.
// `__promptfoo` is a reserved internal namespace (e.g. trace linkage). The server already
// strips it from surfaced result rows; this is defense-in-depth for any path that renders
// raw metadata directly.
export const HIDDEN_METADATA_KEYS = ['citations', '_promptfooFileMetadata', '__promptfoo'];

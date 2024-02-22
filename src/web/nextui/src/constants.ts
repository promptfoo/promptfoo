// Behavior varies depending on whether the app is running as a static HTML app on the user's local machine.
export const IS_RUNNING_LOCALLY = !process.env.NEXT_PUBLIC_PROMPTFOO_BUILD_STANDALONE_SERVER;

export const USE_SUPABASE = !!process.env.NEXT_PUBLIC_PROMPTFOO_USE_SUPABASE;

// The base URL of API routes built into the Next.js app.
export const NEXTJS_BASE_URL = ``;
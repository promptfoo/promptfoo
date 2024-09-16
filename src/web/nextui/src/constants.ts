// Behavior varies depending on whether the app is running as a static HTML app on the user's local machine.
export const IS_RUNNING_LOCALLY = !process.env.NEXT_PUBLIC_HOSTED;

export const USE_SUPABASE = !!process.env.NEXT_PUBLIC_PROMPTFOO_USE_SUPABASE;

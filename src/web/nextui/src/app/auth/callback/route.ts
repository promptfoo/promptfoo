// https://supabase.com/docs/guides/auth/auth-helpers/nextjs
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/*
export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(requestUrl.origin);
}
*/
export async function GET(request: NextRequest) {
  return NextResponse.json({ hello: 'world' });
}

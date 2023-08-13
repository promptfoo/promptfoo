import { NextResponse } from 'next/server';

export async function GET() {
  const data = { message: Math.random() < 0.5 ? 'Hello World!' : 'Hello mom' };
  return NextResponse.json({ data });
}

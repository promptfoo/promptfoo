import React from 'react';
import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'promptfoo Documentation';

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff',
            padding: '40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              width: '100%',
            }}
          >
            <img
              src="/img/logo.png"
              alt="promptfoo Logo"
              width="80"
              height="80"
              style={{
                marginBottom: '20px',
              }}
            />
            <h1
              style={{
                fontSize: '60px',
                fontWeight: 'bold',
                color: '#000000',
                margin: '30px 0',
                maxWidth: '90%',
                wordWrap: 'break-word',
              }}
            >
              {title}
            </h1>
            <div
              style={{
                fontSize: '32px',
                color: '#666666',
              }}
            >
              promptfoo Documentation
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch (error) {
    return new Response('Failed to generate image', { status: 500 });
  }
}

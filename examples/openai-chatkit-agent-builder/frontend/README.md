# ChatKit Frontend Demo

This directory contains a simple HTML demo showing how to integrate ChatKit React components with the custom backend.

## Quick Start

1. **Start the backend** (in another terminal):
   ```bash
   cd ../backend
   python server.py
   ```

2. **Open the demo**:
   ```bash
   # Option 1: Using Python's built-in server
   python -m http.server 3000

   # Option 2: Using npx
   npx serve .

   # Option 3: Just open the file
   open index.html
   ```

3. **Visit**: http://localhost:3000

## React Integration

For a production app, install the ChatKit React SDK:

```bash
npm install @openai/chatkit-react
```

Then use it in your React app:

```tsx
import { ChatKitProvider, Thread } from '@openai/chatkit-react';

function App() {
  return (
    <ChatKitProvider backendUrl="http://localhost:8000/chatkit">
      <Thread />
    </ChatKitProvider>
  );
}
```

## Features

The demo shows:
- Backend connectivity check
- ChatKit integration instructions
- Example React code
- Health status monitoring

## Backend Configuration

The frontend expects the backend to be running on:
- **Backend URL**: http://localhost:8000
- **ChatKit Endpoint**: http://localhost:8000/chatkit
- **Health Check**: http://localhost:8000/health

## CORS

The backend is configured to allow all origins for development. In production, restrict `allow_origins` in `backend/server.py`.

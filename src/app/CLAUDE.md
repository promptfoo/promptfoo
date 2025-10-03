# Frontend Application

**What this is:** React-based web UI (Vite + TypeScript + MUI). Separate workspace from main codebase.

## 🚨 CRITICAL: API Calls

**NEVER use `fetch()` directly. ALWAYS use `callApi()`:**

```typescript
import { callApi } from '@app/utils/api';

// ✅ CORRECT - Handles dev/prod API URLs
const data = await callApi('/traces/evaluation/123');

// ❌ WRONG - Will fail in development
const data = await fetch('/api/traces/evaluation/123');
```

**Why:** `callApi` handles API base URL differences between dev (proxy to localhost:3000) and production.

## Tech Stack

- **React 18** + **TypeScript** + **Vite** (not Next.js, not CRA)
- **Vitest** for testing (NOT Jest - main codebase uses Jest)
- **MUI (Material-UI)** - Component library
- **Zustand** - State management (not Redux)
- **React Router v7** - Routing
- **Socket.io Client** - Real-time updates

## Directory Structure

```
src/app/src/
├── components/    # Reusable UI components
├── pages/        # Route pages
├── hooks/        # Custom React hooks
├── store/        # Zustand state stores
├── contexts/     # React contexts
└── utils/        # Including the critical api.ts
```

## Development

```bash
npm run dev:app    # From root
npm run dev        # From src/app/
```

Runs on `http://localhost:5173` (Vite default).

## Testing

```bash
npm run test       # From src/app/ - uses Vitest
npm run test:app   # From root
```

**Note:** This is **Vitest**, not Jest. Different API, different config.

## Key Patterns

- **State:** Use Zustand stores in `src/store/`
- **Styling:** MUI's `sx` prop for component styles
- **Forms:** Controlled components with local state
- **Data fetching:** Custom hooks with `callApi()`

## Path Alias

`@app/*` maps to `src/*` (configured in `vite.config.ts`).

## When Working Here

- Remember: Use `callApi()` not `fetch()`
- This is a separate workspace (separate package.json)
- Uses Vitest, not Jest
- Build output: `src/app/dist/`

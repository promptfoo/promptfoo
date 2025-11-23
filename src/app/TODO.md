# React 19 Migration TODO

> **Status**: Planning
> **React Version**: 19.2.0 (already upgraded)
> **Last Updated**: 2025-11-22

This document tracks the migration of the React frontend application to leverage React 19 features and patterns.

## Table of Contents

- [Migration Phases](#migration-phases)
- [High Priority Tasks](#high-priority-tasks)
- [Medium Priority Tasks](#medium-priority-tasks)
- [Low Priority Tasks](#low-priority-tasks)
- [Deferred/Not Recommended](#deferrednot-recommended)
- [Testing Strategy](#testing-strategy)
- [References](#references)

---

## Migration Phases

### Phase 1: Low-Risk Syntax Updates (HIGH PRIORITY)

- [ ] Task 1.1: Migrate Context.Provider to Context
- [ ] Task 1.2: Simplify forwardRef in Navigation.tsx

### Phase 2: Form Modernization (MEDIUM PRIORITY)

- [ ] Task 2.1: Convert login form to useActionState

### Phase 3: Data Fetching Improvements (MEDIUM PRIORITY)

- [x] Task 3.1: Audit and migrate custom async hooks to React Query ✅ **COMPLETED**
- [ ] Task 3.2: Set up error boundaries for async components

### Phase 4: Performance Optimization (LOW PRIORITY - Requires Profiling)

- [ ] Task 4.1: Profile component re-renders
- [ ] Task 4.2: Remove unnecessary useMemo/useCallback
- [ ] Task 4.3: Remove unnecessary React.memo

---

## High Priority Tasks

### Task 1.1: Migrate Context.Provider to Context

**Description**: React 19 allows using Context directly without the `.Provider` suffix, reducing boilerplate.

**Priority**: HIGH
**Risk**: LOW
**Estimated Effort**: 1-2 hours
**Affected Files**: 9 files

#### Files to Modify:

1. `src/app/src/contexts/ToastContext.tsx:32`
2. `src/app/src/contexts/UserContext.tsx:21`
3. `src/app/src/contexts/ShiftKeyContext.tsx:30`
4. `src/app/src/pages/redteam/setup/components/TestCaseGenerationProvider.tsx:521`
5. `src/app/src/pages/eval/components/FilterModeProvider.tsx`
6. `src/app/src/components/PostHogProvider.tsx`
7. Review any other context providers in tests

#### Implementation Steps:

1. **For each context provider file:**

   ```diff
   - <MyContext.Provider value={contextValue}>
   + <MyContext value={contextValue}>
       {children}
   - </MyContext.Provider>
   + </MyContext>
   ```

2. **Specific file changes:**

   **`ToastContext.tsx`**:

   ```typescript
   // Line 32: Change from
   <ToastContext.Provider value={{ showToast }}>
   // To
   <ToastContext value={{ showToast }}>
   ```

   **`UserContext.tsx`**:

   ```typescript
   // Line 21: Change from
   <UserContext.Provider value={{ email, setEmail, isLoading }}>
   // To
   <UserContext value={{ email, setEmail, isLoading }}>
   ```

   **`ShiftKeyContext.tsx`**:

   ```typescript
   // Line 30: Change from
   <ShiftKeyContext.Provider value={isShiftKeyPressed}>
   // To
   <ShiftKeyContext value={isShiftKeyPressed}>
   ```

   **`TestCaseGenerationProvider.tsx`**:

   ```typescript
   // Line 521: Change from
   <TestCaseGenerationContext.Provider value={{ ... }}>
   // To
   <TestCaseGenerationContext value={{ ... }}>
   ```

3. **Update closing tags** for all modified contexts

4. **Run linter and formatter**:

   ```bash
   npm run l && npm run f
   ```

5. **Run tests**:

   ```bash
   npm run test
   ```

6. **Manual testing checklist**:
   - [ ] Toast notifications work (trigger a success/error toast)
   - [ ] User authentication flow works
   - [ ] Shift key detection works (hold shift in eval view)
   - [ ] Red team test case generation dialog works
   - [ ] PostHog analytics initializes
   - [ ] Filter mode switching works in eval view

#### Success Criteria:

- [ ] All 9+ context providers migrated to new syntax
- [ ] No `.Provider` suffix remains in any context usage
- [ ] All existing tests pass without modification
- [ ] Manual smoke testing confirms:
  - [ ] Login/logout flow works
  - [ ] Toast notifications display correctly
  - [ ] Keyboard shortcuts work (shift key)
  - [ ] Red team features work
  - [ ] All pages load without console errors
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Build completes successfully: `npm run build`

#### Rollback Plan:

If issues arise, revert to `.Provider` syntax. This is a purely syntactic change with no behavioral differences.

---

### Task 1.2: Simplify forwardRef in Navigation.tsx

**Description**: React 19 treats `ref` as a regular prop, so simple ref forwarding doesn't require `forwardRef`.

**Priority**: HIGH
**Risk**: LOW
**Estimated Effort**: 30 minutes
**Affected Files**: 1 file

#### Files to Modify:

- `src/app/src/components/Navigation.tsx:28-31`

#### Implementation Steps:

1. **Locate the RouterLink component** (lines 28-31):

   ```typescript
   // Current code:
   const RouterLink = forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => (
     <Link ref={ref} {...props} />
   ));
   RouterLink.displayName = 'RouterLink';
   ```

2. **Replace with regular function**:

   ```typescript
   // New code:
   function RouterLink({ ref, ...props }: LinkProps & { ref?: React.Ref<HTMLAnchorElement> }) {
     return <Link ref={ref} {...props} />;
   }
   RouterLink.displayName = 'RouterLink';
   ```

3. **Verify import cleanup**:

   ```typescript
   // Remove forwardRef from imports if no longer used:
   import React, { useState } from 'react'; // Remove forwardRef if not used elsewhere
   ```

4. **Run linter and formatter**:

   ```bash
   npm run l && npm run f
   ```

5. **Run tests**:

   ```bash
   npm run test -- src/app/src/components/Navigation
   ```

6. **Manual testing**:
   - [ ] Click all navigation links (Evals, Prompts, Datasets, History, etc.)
   - [ ] Verify active state highlighting works
   - [ ] Test keyboard navigation (tab through links)
   - [ ] Test dropdowns (Create menu, Evals menu)

#### Success Criteria:

- [ ] `forwardRef` removed from Navigation.tsx RouterLink component
- [ ] Component still properly forwards refs to react-router-dom Link
- [ ] Navigation tests pass
- [ ] Manual testing confirms:
  - [ ] All nav links work
  - [ ] Active link highlighting works
  - [ ] Dropdown menus work
  - [ ] Keyboard navigation works
  - [ ] No console warnings about refs
- [ ] TypeScript compiles without errors
- [ ] No lint errors

#### Important Notes:

**DO NOT MODIFY** these files (they use `useImperativeHandle`):

- `src/app/src/pages/redteam/setup/components/Targets/ProviderConfigEditor.tsx:32`
- `src/app/src/pages/evals/components/EvalsDataGrid.tsx`
- `src/app/src/pages/eval/components/ResultsFilters/FiltersButton.tsx`

These components must keep `forwardRef` because they expose custom ref APIs via `useImperativeHandle`.

#### Rollback Plan:

Revert to `forwardRef` syntax if ref forwarding breaks. Check browser console for ref-related warnings.

---

## Medium Priority Tasks

### Task 2.1: Convert Login Form to useActionState

**Description**: Migrate the login form to use React 19's `useActionState` hook for better async form handling with built-in pending states.

**Priority**: MEDIUM
**Risk**: MEDIUM
**Estimated Effort**: 2-3 hours
**Affected Files**: 1 file

#### Files to Modify:

- `src/app/src/pages/login.tsx`

#### Implementation Steps:

1. **Create the form action function** (before the component):

   ```typescript
   import { useActionState } from 'react';

   interface LoginState {
     success: boolean;
     error?: string;
     email?: string;
   }

   async function loginAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
     const apiKey = formData.get('apiKey') as string;
     const customUrl = formData.get('customUrl') as string;

     // Validation
     if (!apiKey?.trim()) {
       return { success: false, error: 'Please enter your API key' };
     }

     try {
       const response = await callApi('/user/login', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           apiKey: apiKey.trim(),
           apiHost: customUrl || undefined,
         }),
       });

       if (response.ok) {
         const data = await response.json();
         return { success: true, email: data.user.email };
       }

       const errorData = await response.json().catch(() => ({}));
       return {
         success: false,
         error: errorData.error || 'Authentication failed. Please check your API key.',
       };
     } catch {
       return {
         success: false,
         error: 'Network error. Please check your connection and try again.',
       };
     }
   }
   ```

2. **Refactor the component**:

   ```typescript
   export default function LoginPage() {
     const [state, formAction, isPending] = useActionState(loginAction, { success: false });
     const [showApiKey, setShowApiKey] = useState(false);
     const navigate = useNavigate();
     const location = useLocation();
     const { email, isLoading, setEmail, fetchEmail } = useUserStore();

     usePageMeta({
       title: 'Login to Promptfoo',
       description: 'Sign in to access your Promptfoo workspace',
     });

     // Handle successful login
     useEffect(() => {
       if (state.success && state.email) {
         setEmail(state.email);
         handleRedirect();
       }
     }, [state.success, state.email, setEmail]);

     // ... rest of the component logic (keep handleRedirect, etc.)

     return (
       <Container maxWidth="sm">
         {/* ... */}
         <Box component="form" action={formAction} noValidate>
           <Stack spacing={3}>
             <TextField
               id="apiKey"
               name="apiKey"
               label="API Key"
               type={showApiKey ? 'text' : 'password'}
               required
               fullWidth
               autoFocus
               autoComplete="new-password"
               disabled={isPending}
               error={!!state.error}
               helperText={state.error}
               InputProps={{
                 startAdornment: (
                   <InputAdornment position="start">
                     <KeyIcon color="action" />
                   </InputAdornment>
                 ),
                 endAdornment: (
                   <InputAdornment position="end">
                     <IconButton
                       aria-label="toggle API key visibility"
                       onClick={() => setShowApiKey(!showApiKey)}
                       edge="end"
                       size="small"
                     >
                       {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                     </IconButton>
                   </InputAdornment>
                 ),
               }}
             />

             <TextField
               id="customUrl"
               name="customUrl"
               label="API Host"
               type="url"
               fullWidth
               defaultValue="https://www.promptfoo.app"
               disabled={isPending}
               helperText="Change this for private cloud or on-premise deployments"
             />

             <Button
               type="submit"
               fullWidth
               variant="contained"
               size="large"
               disabled={isPending}
               sx={{ py: 1.5 }}
             >
               {isPending ? <CircularProgress size={24} /> : 'Sign In'}
             </Button>
           </Stack>
         </Box>
         {/* ... rest of the UI */}
       </Container>
     );
   }
   ```

3. **Remove old state management**:

   ```typescript
   // DELETE these lines:
   const [apiKeyInput, setApiKeyInput] = useState('');
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [customUrl, setCustomUrl] = useState('https://www.promptfoo.app');

   // DELETE the entire handleSubmit function
   ```

4. **Update tests** (`src/app/src/pages/login.test.tsx`):

   ```typescript
   import { vi } from 'vitest';

   // Mock useActionState
   vi.mock('react', async () => {
     const actual = await vi.importActual('react');
     return {
       ...actual,
       useActionState: vi.fn(() => [
         { success: false }, // state
         vi.fn(), // action
         false, // isPending
       ]),
     };
   });

   // Update existing tests to work with form actions instead of controlled inputs
   ```

5. **Run linter and formatter**:

   ```bash
   npm run l && npm run f
   ```

6. **Run tests**:

   ```bash
   npm run test -- src/app/src/pages/login
   ```

7. **Manual testing checklist**:
   - [ ] Empty form submission shows validation error
   - [ ] Valid credentials successfully log in
   - [ ] Invalid credentials show error message
   - [ ] Network errors are handled gracefully
   - [ ] Pending state shows loading spinner
   - [ ] Custom API host field works
   - [ ] Toggle password visibility works
   - [ ] Redirect after login works
   - [ ] Error messages display correctly

#### Success Criteria:

- [ ] Login form uses `useActionState` instead of manual state management
- [ ] Form submission handled via `action` prop
- [ ] Loading state derived from `isPending`
- [ ] Error handling works for all cases:
  - [ ] Empty form
  - [ ] Invalid credentials
  - [ ] Network errors
  - [ ] Server errors
- [ ] All existing tests updated and passing
- [ ] Manual testing confirms all functionality works
- [ ] No TypeScript errors
- [ ] No console errors or warnings
- [ ] Build succeeds

#### Testing Requirements:

**Unit Tests**:

- [ ] Test successful login flow
- [ ] Test validation errors
- [ ] Test network errors
- [ ] Test pending state

**Integration Tests**:

- [ ] Test redirect after login
- [ ] Test with different API hosts
- [ ] Test error recovery

**Manual Tests**:

- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari (if available)
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility

#### Rollback Plan:

Keep a backup of the original `login.tsx`. If issues arise:

1. Revert to controlled form inputs
2. Restore manual `isSubmitting` state
3. Restore original `handleSubmit` function

#### Notes:

- This is a good learning task for React 19 patterns
- Consider creating a shared form action pattern for other forms
- May want to add optimistic UI updates in future

---

### Task 3.1: Audit and Migrate Custom Async Hooks to React Query

**Description**: The codebase has several custom async hooks (`useCloudConfig`, `useVersionCheck`, `useEmailVerification`) that manually manage loading/error state. React Query provides better caching, revalidation, and error handling.

**Priority**: MEDIUM
**Risk**: MEDIUM
**Estimated Effort**: 4-6 hours
**Affected Files**: 3-5 files

#### Files to Audit:

1. `src/app/src/hooks/useCloudConfig.ts` - ⚠️ High priority (used in multiple places)
2. `src/app/src/hooks/useVersionCheck.ts` - Medium priority
3. `src/app/src/hooks/useEmailVerification.ts` - Medium priority
4. Any other hooks with manual `useState` + `useEffect` + `callApi` pattern

#### Benefits of Migration:

- Automatic caching and deduplication
- Built-in stale-while-revalidate
- Better error retry logic
- Simpler code (no manual loading/error state)
- DevTools support

#### Implementation Steps:

1. **Audit existing React Query usage**:

   ```bash
   # See how useApiHealth.tsx uses React Query (line 20-44)
   # This is the pattern to follow
   ```

2. **Migrate useCloudConfig.ts**:

   **Before**:

   ```typescript
   // src/app/src/hooks/useCloudConfig.ts (60 lines)
   export default function useCloudConfig(): {
     data: CloudConfigData | null;
     isLoading: boolean;
     error: string | null;
     refetch: () => void;
   } {
     const [data, setData] = useState<CloudConfigData | null>(null);
     const [isLoading, setIsLoading] = useState<boolean>(true);
     const [error, setError] = useState<string | null>(null);

     const fetchCloudConfig = async () => {
       try {
         setIsLoading(true);
         setError(null);
         const response = await callApi('/user/cloud-config');
         if (!response.ok) {
           throw new Error('Failed to fetch cloud config');
         }
         const responseData = await response.json();
         setData(responseData);
       } catch (err) {
         const errorMessage = err instanceof Error ? err.message : 'Unknown error';
         setError(errorMessage);
         console.error('Error fetching cloud config:', err);
       } finally {
         setIsLoading(false);
       }
     };

     useEffect(() => {
       fetchCloudConfig();
     }, []);

     return { data, isLoading, error, refetch: fetchCloudConfig };
   }
   ```

   **After**:

   ```typescript
   // src/app/src/hooks/useCloudConfig.ts (simplified to ~20 lines)
   import { useQuery } from '@tanstack/react-query';
   import { callApi } from '../utils/api';

   export type CloudConfigData = {
     appUrl: string;
     isEnabled: boolean;
   };

   async function fetchCloudConfig(): Promise<CloudConfigData> {
     const response = await callApi('/user/cloud-config');
     if (!response.ok) {
       throw new Error('Failed to fetch cloud config');
     }
     return response.json();
   }

   export default function useCloudConfig() {
     return useQuery<CloudConfigData, Error>({
       queryKey: ['cloudConfig'],
       queryFn: fetchCloudConfig,
       staleTime: 5 * 60 * 1000, // 5 minutes
       retry: 1,
       retryDelay: 1000,
     });
   }
   ```

3. **Update all call sites**:

   Find all usages:

   ```bash
   npm run local -- eval "grep -r 'useCloudConfig' src/app/src --include='*.tsx' --include='*.ts'"
   ```

   Update from:

   ```typescript
   const { data, isLoading, error, refetch } = useCloudConfig();
   ```

   To (same API!):

   ```typescript
   const { data, isLoading, error, refetch } = useCloudConfig();
   // React Query returns compatible API, so most code doesn't need changes
   ```

   **Note**: React Query returns `data: CloudConfigData | undefined` instead of `data: CloudConfigData | null`. Update type checks:

   ```typescript
   // Before:
   if (data !== null) {
     /* ... */
   }

   // After:
   if (data) {
     /* ... */
   }
   ```

4. **Migrate useVersionCheck.ts** (similar pattern):

   ```typescript
   export function useVersionCheck() {
     return useQuery<VersionData, Error>({
       queryKey: ['version'],
       queryFn: async () => {
         const response = await callApi('/version');
         if (!response.ok) throw new Error('Failed to fetch version');
         return response.json();
       },
       staleTime: 10 * 60 * 1000, // 10 minutes
       retry: false,
     });
   }
   ```

5. **Migrate useEmailVerification.ts** (similar pattern):

   ```typescript
   export function useEmailVerification(email: string) {
     return useQuery<VerificationData, Error>({
       queryKey: ['emailVerification', email],
       queryFn: async () => {
         const response = await callApi(`/user/verify?email=${encodeURIComponent(email)}`);
         if (!response.ok) throw new Error('Failed to verify email');
         return response.json();
       },
       enabled: Boolean(email), // Only run if email is provided
       staleTime: 1 * 60 * 1000, // 1 minute
       retry: 1,
     });
   }
   ```

6. **Update tests**:

   ```typescript
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
   import { renderHook, waitFor } from '@testing-library/react';

   describe('useCloudConfig', () => {
     it('should fetch cloud config', async () => {
       const queryClient = new QueryClient();
       const wrapper = ({ children }) => (
         <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
       );

       const { result } = renderHook(() => useCloudConfig(), { wrapper });

       expect(result.current.isLoading).toBe(true);

       await waitFor(() => {
         expect(result.current.isLoading).toBe(false);
       });

       expect(result.current.data).toBeDefined();
     });
   });
   ```

7. **Run linter and formatter**:

   ```bash
   npm run l && npm run f
   ```

8. **Run tests**:
   ```bash
   npm run test -- src/app/src/hooks
   ```

#### Success Criteria:

- [ ] All 3+ custom async hooks migrated to React Query
- [ ] No manual `useState` + `useEffect` pattern for API calls
- [ ] All call sites updated and working
- [ ] Tests updated and passing:
  - [ ] useCloudConfig tests pass
  - [ ] useVersionCheck tests pass
  - [ ] useEmailVerification tests pass
- [ ] Manual testing confirms:
  - [ ] Cloud config loads correctly
  - [ ] Version check works
  - [ ] Email verification works
  - [ ] Error states display properly
  - [ ] Loading states work
  - [ ] Data caching works (no duplicate requests)
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Build succeeds

#### Testing Requirements:

**Unit Tests**:

- [ ] Test successful data fetch
- [ ] Test error handling
- [ ] Test loading states
- [ ] Test refetch functionality

**Integration Tests**:

- [ ] Test with React Query DevTools (optional)
- [ ] Verify caching behavior
- [ ] Verify deduplication

**Manual Tests**:

- [ ] Check Network tab for duplicate requests
- [ ] Verify error recovery
- [ ] Test offline behavior

#### Rollback Plan:

Keep backup of original hooks. If issues arise:

1. Revert to manual state management
2. Check React Query provider is properly set up
3. Verify query keys are unique

#### Notes:

- React Query is already in package.json: `"@tanstack/react-query": "^5.90.10"`
- Pattern already established in `useApiHealth.tsx`
- Consider adding React Query DevTools for development
- May want to create a `queryClient.ts` file for centralized config

---

### Task 3.2: Set Up Error Boundaries for Async Components

**Description**: If migrating to React 19's `use()` hook in the future, error boundaries are required. Set up a pattern now for better error handling.

**Priority**: MEDIUM
**Risk**: LOW
**Estimated Effort**: 2-3 hours
**Affected Files**: Multiple

#### Implementation Steps:

1. **Review existing ErrorBoundary**:
   - `src/app/src/components/ErrorBoundary.tsx` - Already exists ✅
   - Used in: `src/app/src/pages/eval/components/ResultsTable.tsx:3`
   - Used in: `src/app/src/pages/eval/components/MarkdownErrorBoundary.tsx`

2. **Audit error boundary coverage**:

   ```bash
   # Find all route components without error boundaries
   grep -r "export default" src/app/src/pages --include="*.tsx" | grep -v "ErrorBoundary"
   ```

3. **Add error boundaries to critical sections**:

   **Pattern to follow**:

   ```typescript
   import ErrorBoundary from '@app/components/ErrorBoundary';

   export default function MyPage() {
     return (
       <ErrorBoundary name="MyPage">
         <PageContent />
       </ErrorBoundary>
     );
   }
   ```

   **Priority pages** (add error boundaries):
   - [ ] `src/app/src/pages/login.tsx` - Login page
   - [ ] `src/app/src/pages/eval/components/Eval.tsx` - Main eval view
   - [ ] `src/app/src/pages/redteam/report/page.tsx` - Red team report
   - [ ] `src/app/src/pages/redteam/setup/page.tsx` - Red team setup
   - [ ] `src/app/src/pages/prompts/page.tsx` - Prompts page
   - [ ] `src/app/src/pages/datasets/page.tsx` - Datasets page

4. **Create a QueryErrorBoundary** for React Query errors:

   ```typescript
   // src/app/src/components/QueryErrorBoundary.tsx
   import { QueryErrorResetBoundary } from '@tanstack/react-query';
   import ErrorBoundary from './ErrorBoundary';

   export default function QueryErrorBoundary({
     children,
     name,
   }: {
     children: React.ReactNode;
     name?: string;
   }) {
     return (
       <QueryErrorResetBoundary>
         {({ reset }) => (
           <ErrorBoundary
             name={name}
             fallback={
               <div>
                 <p>Error loading data</p>
                 <button onClick={reset}>Try again</button>
               </div>
             }
           >
             {children}
           </ErrorBoundary>
         )}
       </QueryErrorResetBoundary>
     );
   }
   ```

5. **Wrap async data components**:

   ```typescript
   // Example: In a page that uses React Query
   import QueryErrorBoundary from '@app/components/QueryErrorBoundary';

   export default function MyPage() {
     return (
       <QueryErrorBoundary name="MyPage Data">
         <AsyncDataComponent />
       </QueryErrorBoundary>
     );
   }
   ```

6. **Test error boundaries**:

   ```typescript
   // Create a test component that throws
   function ErrorThrower() {
     throw new Error('Test error');
   }

   // Manually test by temporarily rendering ErrorThrower
   ```

7. **Run linter and formatter**:

   ```bash
   npm run l && npm run f
   ```

8. **Run tests**:
   ```bash
   npm run test
   ```

#### Success Criteria:

- [ ] All major pages wrapped in error boundaries
- [ ] QueryErrorBoundary created and documented
- [ ] Error boundaries tested with:
  - [ ] Thrown errors
  - [ ] Promise rejections
  - [ ] React Query errors
- [ ] Manual testing confirms:
  - [ ] Errors show user-friendly message
  - [ ] "Reload Page" button works
  - [ ] Error details shown in dev mode
  - [ ] Error details hidden in production
  - [ ] Errors don't crash entire app
- [ ] Console logs errors appropriately
- [ ] No TypeScript errors
- [ ] Build succeeds

#### Testing Requirements:

**Unit Tests**:

- [ ] Test error boundary catches errors
- [ ] Test fallback UI renders
- [ ] Test reload functionality

**Manual Tests**:

- [ ] Trigger an error in each protected section
- [ ] Verify error UI appears
- [ ] Verify reload button works
- [ ] Check dev vs. production behavior

#### Rollback Plan:

Error boundaries can be removed individually if causing issues. No breaking changes.

#### Notes:

- Error boundaries are required for class components (current implementation is correct)
- React 19 doesn't change error boundary behavior
- This sets foundation for future `use()` hook adoption

---

## Low Priority Tasks

### Task 4.1: Profile Component Re-Renders

**Description**: Before removing any performance optimizations, establish baseline performance metrics.

**Priority**: LOW
**Risk**: NONE (observation only)
**Estimated Effort**: 2-3 hours
**Affected Files**: None (profiling only)

#### Implementation Steps:

1. **Install React DevTools Profiler** (if not already installed)

2. **Profile critical user flows**:
   - [ ] Load eval results page with 100+ rows
   - [ ] Apply filters to eval results
   - [ ] Sort eval results table
   - [ ] Navigate between pages
   - [ ] Open/close red team setup
   - [ ] Type in search fields

3. **Document findings**:

   ```markdown
   # Performance Profile Results

   ## Eval Results Table

   - Initial render: \_\_\_ ms
   - Filter application: \_\_\_ ms
   - Sort operation: \_\_\_ ms
   - Re-renders per interaction: \_\_\_
   - Components with excessive re-renders: \_\_\_

   ## Red Team Setup

   - Initial render: \_\_\_ ms
   - Plugin selection: \_\_\_ ms
   - Strategy configuration: \_\_\_ ms

   ## Recommendations

   - Components to keep memoized: \_\_\_
   - Components safe to remove memo: \_\_\_
   - Other optimizations needed: \_\_\_
   ```

4. **Create performance baseline test**:

   ```typescript
   // src/app/src/tests/performance.test.ts
   import { render } from '@testing-library/react';
   import { ResultsTable } from '@app/pages/eval/components/ResultsTable';

   describe('Performance baseline', () => {
     it('should render large table within acceptable time', () => {
       const start = performance.now();
       const largeData = generateMockData(1000); // 1000 rows
       render(<ResultsTable data={largeData} />);
       const end = performance.now();

       expect(end - start).toBeLessThan(1000); // Less than 1 second
     });
   });
   ```

5. **Enable React DevTools Profiler recording**:
   - Click "Record" in DevTools Profiler
   - Perform user interaction
   - Stop recording
   - Analyze flame graph
   - Export results

6. **Document high-re-render components**:
   ```bash
   # Components rendering >10 times per interaction:
   - ResultsTable: 15 renders (caused by: state updates in parent)
   - EvalOutputCell: 20 renders (caused by: inline functions)
   ```

#### Success Criteria:

- [ ] Performance profiles captured for all critical flows
- [ ] Baseline metrics documented
- [ ] High-re-render components identified
- [ ] Recommendations documented for:
  - [ ] Which memoizations to keep
  - [ ] Which memoizations to remove
  - [ ] Other optimization opportunities
- [ ] Report saved in `docs/performance-baseline.md`

#### Deliverable:

Create `docs/performance-baseline.md` with:

- Profiling methodology
- Baseline metrics
- Screenshots from React DevTools
- Recommendations for Task 4.2 and 4.3

#### Notes:

- This is a prerequisite for tasks 4.2 and 4.3
- Do not make any code changes in this task
- Focus on measurement, not optimization

---

### Task 4.2: Remove Unnecessary useMemo/useCallback

**Description**: Based on profiling results from Task 4.1, selectively remove unnecessary memoization.

**Priority**: LOW (BLOCKED by Task 4.1)
**Risk**: MEDIUM (can impact performance)
**Estimated Effort**: 4-6 hours
**Affected Files**: 41+ files with useCallback, 49+ files with useMemo

#### Prerequisites:

- [ ] Task 4.1 (profiling) completed
- [ ] Performance baseline documented
- [ ] React Compiler status checked (not available yet)

#### Implementation Steps:

1. **Review profiling results** from Task 4.1

2. **Identify removal candidates**:

   **Safe to remove** (generally):
   - Simple calculations: `useMemo(() => a + b, [a, b])`
   - String concatenations: `useMemo(() => `${prefix}-${id}`, [prefix, id])`
   - Object property access: `useMemo(() => user.name, [user])`
   - Callbacks not passed to children: `useCallback(() => console.log(x), [x])`

   **Keep** (generally):
   - Dependencies of other hooks: `useEffect(() => {}, [memoizedValue])`
   - Props to frequently re-rendering children
   - Expensive computations (array sort, filter on large data)
   - Callbacks passed to React.memo components

3. **Review CLAUDE.md guidance**:

   > Use useMemo when computing a value, and useCallback when creating a stable function reference

   This guidance is still valid. Don't remove memoization that serves a purpose.

4. **Example removal**:

   **Before**:

   ```typescript
   const label = useMemo(() => `User: ${name}`, [name]);
   ```

   **After**:

   ```typescript
   const label = `User: ${name}`;
   ```

   **Before**:

   ```typescript
   const handleClick = useCallback(() => {
     console.log('clicked');
   }, []);
   ```

   **After**:

   ```typescript
   const handleClick = () => {
     console.log('clicked');
   };
   ```

5. **Process each file incrementally**:
   - [ ] Remove 1-2 memoizations
   - [ ] Run tests
   - [ ] Profile performance
   - [ ] If performance degrades, revert
   - [ ] Continue with next file

6. **High-priority files** (based on occurrence count):
   - [ ] `src/app/src/pages/redteam/setup/components/Strategies.tsx` - 12 useCallback
   - [ ] `src/app/src/pages/eval/components/ResultsTable.tsx` - 12 useMemo
   - [ ] `src/app/src/pages/redteam/setup/components/TestCaseGenerationProvider.tsx` - 8 useCallback
   - [ ] `src/app/src/pages/redteam/setup/components/Plugins.tsx` - 8 combined

7. **Testing after each change**:

   ```bash
   # Run tests
   npm run test

   # Profile in dev mode
   npm run dev:app
   # Then use React DevTools Profiler

   # Build and check production bundle size
   npm run build
   ```

8. **Document changes**:

   ```markdown
   ## Memoization Removal Log

   ### File: Strategies.tsx

   - Removed: `useMemo` on line 45 (simple string concat)
   - Performance impact: None (0% change in render time)
   - Kept: `useCallback` on line 67 (passed to child)
   ```

#### Success Criteria:

- [ ] At least 10-20% reduction in memoization usage
- [ ] No performance regressions (per profiling)
- [ ] All tests pass
- [ ] Manual testing confirms no issues:
  - [ ] Eval results table performance
  - [ ] Red team setup responsiveness
  - [ ] Filter/search performance
- [ ] Changes documented
- [ ] Code is more readable
- [ ] Build succeeds

#### Testing Requirements:

**Performance Tests**:

- [ ] Re-run profiling from Task 4.1
- [ ] Compare before/after metrics
- [ ] Ensure <5% regression allowed

**Unit Tests**:

- [ ] All existing tests pass
- [ ] No new test failures

**Manual Tests**:

- [ ] Interact with affected components
- [ ] Verify responsiveness
- [ ] Check for laggy UI

#### Rollback Plan:

Commit changes incrementally. If performance degrades:

1. Identify problematic removal
2. Revert specific change
3. Document why memoization is needed

#### Notes:

- This is NOT about removing all memoization
- Only remove what profiling shows is unnecessary
- When in doubt, keep the memoization
- React Compiler (when available) will handle this automatically

---

### Task 4.3: Remove Unnecessary React.memo

**Description**: Based on profiling results, selectively remove unnecessary `React.memo` wrappers.

**Priority**: LOW (BLOCKED by Task 4.1)
**Risk**: MEDIUM (can impact performance)
**Estimated Effort**: 2-3 hours
**Affected Files**: 11 files

#### Prerequisites:

- [ ] Task 4.1 (profiling) completed
- [ ] Task 4.2 (useMemo/useCallback cleanup) completed

#### Files to Review:

1. `src/app/src/pages/eval/components/EvalOutputCell.tsx`
2. `src/app/src/pages/eval/components/ResultsTable.tsx`
3. `src/app/src/pages/eval/components/ResultsView.tsx`
4. `src/app/src/pages/eval/components/ResultsCharts.tsx`
5. `src/app/src/pages/eval/components/TruncatedText.tsx`
6. `src/app/src/pages/eval/components/TableSettings/components/SettingItem.tsx`
7. `src/app/src/pages/eval/components/TableSettings/components/SettingsSection.tsx`
8. `src/app/src/pages/eval/components/TableSettings/components/EnhancedRangeSlider.tsx`
9. `src/app/src/pages/eval/components/TableSettings/components/SettingsPanel.tsx`
10. `src/app/src/pages/eval/components/TableSettings/TableSettingsModal.tsx`
11. `src/app/src/components/DarkMode.tsx`

#### Implementation Steps:

1. **Review profiling data** from Task 4.1 for each component

2. **Identify removal candidates**:

   **Safe to remove**:
   - Components that rarely re-render
   - Components with cheap render functions
   - Components without expensive children

   **Keep React.memo**:
   - Components in lists (map functions)
   - Components with expensive render logic
   - Components that receive frequently-changing props from parent
   - Components confirmed by profiling to benefit from memoization

3. **Example: TruncatedText.tsx**:

   **Check current usage**:

   ```typescript
   const TruncatedText = React.memo(({ text, maxLength }: Props) => {
     // Simple component that just truncates text
   });
   ```

   **Decision matrix**:
   - Is it in a list? → Check usage
   - Is render expensive? → No (just string slicing)
   - Does profiling show benefit? → Check Task 4.1 results

   **If profiling shows no benefit**:

   ```typescript
   // Remove React.memo wrapper
   export default function TruncatedText({ text, maxLength }: Props) {
     // Keep displayName for debugging
     return <div>{text.slice(0, maxLength)}</div>;
   }
   TruncatedText.displayName = 'TruncatedText';
   ```

4. **For each component**:
   - [ ] Check profiling data
   - [ ] Remove React.memo wrapper
   - [ ] Keep displayName
   - [ ] Test performance
   - [ ] If regression, revert

5. **Special attention to table components**:
   - ResultsTable.tsx - Likely needs React.memo (large data)
   - EvalOutputCell.tsx - Likely needs React.memo (in list)
   - Keep these memoized unless profiling strongly suggests otherwise

6. **Run tests after each change**:
   ```bash
   npm run test
   npm run dev:app
   # Profile with React DevTools
   ```

#### Success Criteria:

- [ ] 3-5 React.memo wrappers removed (based on profiling)
- [ ] No performance regressions (per profiling)
- [ ] displayName preserved on all components
- [ ] All tests pass
- [ ] Manual testing confirms no issues:
  - [ ] Tables scroll smoothly
  - [ ] Filters apply quickly
  - [ ] No UI lag
- [ ] Changes documented
- [ ] Build succeeds

#### Testing Requirements:

**Performance Tests**:

- [ ] Re-run profiling from Task 4.1
- [ ] Compare render times
- [ ] Check re-render counts

**Unit Tests**:

- [ ] All component tests pass
- [ ] No behavior changes

**Manual Tests**:

- [ ] Interact with tables
- [ ] Apply filters rapidly
- [ ] Scroll through large datasets

#### Rollback Plan:

If component shows performance regression:

1. Re-add React.memo wrapper
2. Document why it's needed
3. Keep for future reference

#### Notes:

- React.memo is still useful in React 19 for heavy components
- Don't remove based on assumption - use profiling data
- displayName is valuable for debugging - always keep it

---

## Deferred/Not Recommended

### Task 5.1: Migrate Error Boundaries to Hooks (DEFERRED)

**Status**: ❌ NOT AVAILABLE
**Description**: React 19 does not yet provide a hook-based error boundary API.

**Current Implementation**:

- `src/app/src/components/ErrorBoundary.tsx` - Class component ✓ Correct
- `src/app/src/pages/eval/components/MarkdownErrorBoundary.tsx` - Class component ✓ Correct

**Action**: No action needed. Error boundaries must remain class components.

**Future**: If React releases `useErrorBoundary()` or similar hook, revisit this.

---

### Task 5.2: Add Suspense Boundaries (DEFERRED)

**Status**: 🔄 OPTIONAL
**Description**: React 19's `use()` hook works with Suspense for async data. Currently not using Suspense/lazy loading.

**Current State**:

- No `React.lazy` usage
- No `<Suspense>` boundaries
- All components load eagerly

**Recommendation**: Defer until:

1. Bundle size becomes an issue
2. Route-based code splitting is needed
3. Migrating to `use()` hook for data fetching

**Future Consideration**:

```typescript
// Example of route-based code splitting
const EvalPage = React.lazy(() => import('@app/pages/eval'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/eval" element={<EvalPage />} />
      </Routes>
    </Suspense>
  );
}
```

**Decision**: Not needed now. Revisit if performance profiling shows slow initial load.

---

### Task 5.3: Migrate to use() Hook for Data Fetching (NOT RECOMMENDED)

**Status**: ❌ NOT RECOMMENDED
**Description**: React 19's `use()` hook can replace some async patterns, but React Query is better.

**Reasoning**:

- React Query provides better features (caching, revalidation, retry)
- React Query already in use (`useApiHealth.tsx`)
- `use()` requires Suspense boundaries everywhere
- `use()` doesn't provide loading states as cleanly
- React Query DevTools available

**Recommendation**: Complete Task 3.1 (migrate to React Query) instead of using `use()`.

**When to use `use()`**:

- Reading Context values conditionally
- Server Components (not applicable for this SPA)
- Very simple data fetching without caching needs

**Decision**: Stick with React Query. Do not migrate to `use()`.

---

## Testing Strategy

### Unit Testing

**Tools**: Vitest + Testing Library

**Key Test Areas**:

1. Context providers render children correctly
2. Form actions handle success/error states
3. Error boundaries catch and display errors
4. Hooks return expected data structures
5. Components render without errors

**Test Template**:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('MyComponent after React 19 migration', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should handle errors gracefully', () => {
    // Test error states
  });

  it('should maintain backward compatibility', () => {
    // Ensure existing behavior unchanged
  });
});
```

### Integration Testing

**Focus Areas**:

1. Authentication flow (login/logout)
2. Eval results loading and filtering
3. Red team setup and generation
4. Data fetching and caching
5. Error recovery

**Manual Test Checklist**:

```markdown
## Login Flow

- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Login error handling
- [ ] Redirect after login

## Eval Results

- [ ] Load eval with 100+ rows
- [ ] Apply filters
- [ ] Sort columns
- [ ] Search functionality
- [ ] Export data

## Red Team

- [ ] Configure plugins
- [ ] Configure strategies
- [ ] Generate test cases
- [ ] Run evaluation

## Error Handling

- [ ] Trigger error in eval view
- [ ] Trigger error in red team
- [ ] Verify error boundary catches
- [ ] Verify reload works
```

### Performance Testing

**Metrics to Track**:

- Initial page load time
- Time to interactive
- Component render time
- Re-render count
- Bundle size

**Tools**:

- React DevTools Profiler
- Chrome DevTools Performance tab
- Lighthouse

**Benchmarks** (establish in Task 4.1):

- Eval table initial render: < 1000ms
- Filter application: < 200ms
- Search input: < 100ms response

### Regression Testing

**Critical Paths**:

1. User can log in ✅
2. User can view eval results ✅
3. User can create red team config ✅
4. User can generate test cases ✅
5. Errors don't crash the app ✅

**Before Each Task**:

1. Document current behavior
2. Run full test suite
3. Capture performance baseline

**After Each Task**:

1. Run full test suite
2. Compare performance metrics
3. Manual smoke test
4. Check browser console for errors

---

## References

### React 19 Documentation

- [React 19 Release Notes](https://react.dev/blog/2024/04/25/react-19)
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [useActionState Hook](https://react.dev/reference/react/useActionState)
- [use() Hook](https://react.dev/reference/react/use)

### Project Documentation

- [CLAUDE.md](./CLAUDE.md) - Project-specific conventions
- [Main CLAUDE.md](../../CLAUDE.md) - General development guidelines

### Related Tools

- [React Query Documentation](https://tanstack.com/query/latest/docs/react/overview)
- [React DevTools Profiler Guide](https://react.dev/learn/react-developer-tools)
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/)

---

## Progress Tracking

### Phase 1: Low-Risk Syntax Updates

- [ ] Task 1.1: Context.Provider migration (0/9 files)
- [ ] Task 1.2: forwardRef simplification (0/1 files)

### Phase 2: Form Modernization

- [ ] Task 2.1: Login form to useActionState (0/1 files)

### Phase 3: Data Fetching

- [ ] Task 3.1: Migrate to React Query (0/3 hooks)
- [ ] Task 3.2: Error boundaries (0/6 pages)

### Phase 4: Performance (Requires Profiling)

- [ ] Task 4.1: Performance profiling (not started)
- [ ] Task 4.2: useMemo/useCallback cleanup (blocked)
- [ ] Task 4.3: React.memo cleanup (blocked)

### Overall Progress: 0% Complete

---

## Notes

- All tasks are scoped for React 19.2.0 (already upgraded)
- Migration is non-breaking - old patterns still work
- Focus on value, not just "using new features"
- Measure performance before and after optimizations
- Keep code readable and maintainable
- Follow existing project conventions in CLAUDE.md

---

**Last Updated**: 2025-11-22
**Next Review**: After Phase 1 completion

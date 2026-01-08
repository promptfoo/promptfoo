# AuthorChip Editability Plan

## Problem Statement

The `AuthorChip` component in `ResultsView.tsx` currently has `editable` hardcoded to `true`, allowing anyone to edit the author of any eval. This is problematic when:

1. Multiple users share a self-hosted server
2. Users are logged into Promptfoo Cloud (identity is known)
3. Someone could accidentally or maliciously change another user's eval authorship

## User Scenarios

### Scenario Matrix

| Scenario              | Cloud Enabled | Author Set | Author Matches User | Should Allow Edit?   |
| --------------------- | ------------- | ---------- | ------------------- | -------------------- |
| Local single user     | No            | No         | N/A                 | Yes                  |
| Local single user     | No            | Yes        | N/A                 | Yes                  |
| Local + cloud login   | Yes           | No         | N/A                 | Yes (claim it)       |
| Local + cloud login   | Yes           | Yes        | Yes                 | Yes (it's yours)     |
| Local + cloud login   | Yes           | Yes        | No                  | **No**               |
| Self-hosted, no cloud | No            | \*         | N/A                 | Yes (no auth system) |
| Self-hosted + cloud   | Yes           | No         | N/A                 | Yes (claim it)       |
| Self-hosted + cloud   | Yes           | Yes        | Yes                 | Yes (it's yours)     |
| Self-hosted + cloud   | Yes           | Yes        | No                  | **No**               |

### Key Insight

- **Without cloud auth**: We have no identity system, so we can't verify ownership. Allow editing - be "kind" to self-hosted users who haven't set up auth.
- **With cloud auth**: We know who the user is. Only allow editing your own evals or unclaimed evals.

## Developer Experience Considerations

### Local CLI User (most common)

- Promptfoo is primarily a local CLI tool
- Single user, their evals, full control
- **Experience**: Everything works, can edit freely

### Self-Hosted Team Without Cloud Auth

- Multiple devs share one server
- No authentication - anyone can see everything
- They've chosen convenience over access control
- **Experience**: Allow editing. If they want protection, they should enable cloud auth. Don't break their workflow.

### Self-Hosted Team With Cloud Auth

- Multiple devs, each logged in with their own API key
- Clear identity system in place
- **Experience**: Protect ownership. Can only edit your own evals. Clear feedback when viewing someone else's eval.

### Cloud-Connected User Viewing Teammate's Eval

- Logged in, viewing an eval with a different author
- **Experience**: Cannot edit author. Tooltip explains: "This eval belongs to alice@example.com"

## Proposed Solution

### 1. Frontend Changes (ResultsView.tsx)

```typescript
// Add import
import useCloudConfig from '@app/hooks/useCloudConfig';

// In component
const { data: cloudConfig } = useCloudConfig();

// Compute editability
const canEditAuthor = useMemo(() => {
  // If cloud is not enabled, allow editing
  // (no identity system to verify ownership)
  if (!cloudConfig?.isEnabled) {
    return true;
  }

  // Cloud is enabled - we know the user's identity
  // Allow editing if:
  // 1. No author is set (unclaimed eval - they can claim it)
  // 2. Author matches current user's email (it's their eval)
  if (!author) {
    return true;
  }

  return author === currentUserEmail;
}, [cloudConfig?.isEnabled, author, currentUserEmail]);

// Pass to component
<AuthorChip
  author={author}
  onEditAuthor={handleEditAuthor}
  currentUserEmail={currentUserEmail}
  editable={canEditAuthor}
  isCloudEnabled={cloudConfig?.isEnabled ?? false}
/>
```

### 2. AuthorChip UX Overhaul

The key insight: **when logged into cloud, don't use free text**.

#### Why No Free Text When Cloud Enabled?

| Problem                                                       | Impact                     |
| ------------------------------------------------------------- | -------------------------- |
| User types `alice@company.com` when they're `bob@company.com` | Impersonation              |
| User typos their own email                                    | Identity mismatch          |
| User sets eval to fake email                                  | Undermines identity system |

There's no legitimate reason to set YOUR eval's author to someone else's email.

#### Cloud-Enabled UI (New)

**Unclaimed eval:**

```
┌─────────────────────────────────────┐
│ This eval has no author             │
│                                     │
│ [Claim as mine (bob@company.com)]   │
└─────────────────────────────────────┘
```

**Your eval:**

```
┌─────────────────────────────────────┐
│ Author: bob@company.com (you)       │
│                                     │
│ [Remove my name]                    │
└─────────────────────────────────────┘
```

- **No free text field** - identity comes from cloud
- **One-click actions** - clearer intent
- **No impersonation possible** - can only set to YOUR verified email

#### Cloud-Disabled UI (Keep Current)

```
┌─────────────────────────────────────┐
│ Author Email                        │
│ [____________________________] Save │
│                                     │
│ ℹ️ Setting an email will also set   │
│   the default author for future...  │
└─────────────────────────────────────┘
```

- **Free text field** - no identity system to verify against
- Keep flexibility for self-hosted teams without auth

#### Updated Props Interface

```typescript
interface AuthorChipProps {
  author: string | null;
  onEditAuthor: (newAuthor: string) => Promise<void>;
  currentUserEmail: string | null;
  editable: boolean;
  isCloudEnabled: boolean; // NEW: controls UI mode
}
```

### 3. AuthorChip Implementation

```typescript
export const AuthorChip = ({
  author,
  onEditAuthor,
  currentUserEmail,
  editable,
  isCloudEnabled,
}: AuthorChipProps) => {
  // ... existing state ...

  // Popover content changes based on cloud mode
  const renderPopoverContent = () => {
    if (isCloudEnabled) {
      // Cloud mode: action buttons, no free text
      return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', width: '400px' }}>
          {!author ? (
            // Unclaimed eval
            <>
              <Typography variant="body2" sx={{ mb: 2 }}>
                This eval has no author assigned.
              </Typography>
              <Button
                variant="contained"
                onClick={() => handleCloudAction(currentUserEmail || '')}
                disabled={isLoading || !currentUserEmail}
              >
                {isLoading ? <CircularProgress size={24} /> : `Claim as mine (${currentUserEmail})`}
              </Button>
            </>
          ) : (
            // Your eval (author === currentUserEmail, since we can only edit our own)
            <>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Author:</strong> {author} (you)
              </Typography>
              <Button
                variant="outlined"
                color="warning"
                onClick={() => handleCloudAction('')}
                disabled={isLoading}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Remove my name'}
              </Button>
            </>
          )}
          {error && (
            <Typography color="error" variant="caption" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </Box>
      );
    }

    // Non-cloud mode: keep existing free text UI
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', width: '400px' }}>
        {/* ... existing TextField implementation ... */}
      </Box>
    );
  };

  const handleCloudAction = async (newAuthor: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      await onEditAuthor(newAuthor);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // ... rest of component ...
};
```

### 4. Tooltip Enhancement

```typescript
const getTooltipTitle = () => {
  if (!editable) {
    return author ? `This eval belongs to ${author}` : 'Author';
  }
  if (isCloudEnabled) {
    return author ? 'Click to manage authorship' : 'Click to claim this eval';
  }
  return author ? 'Click to edit author' : 'Click to set author';
};
```

### 3. Server-Side Authorization (Future Enhancement)

For defense-in-depth, the `PATCH /:id/author` endpoint could also verify ownership. This is optional for the initial implementation since the frontend check provides reasonable protection.

```typescript
// In src/server/routes/eval.ts PATCH /:id/author handler
// After finding the eval:

if (cloudConfig.isEnabled()) {
  const currentUserEmail = getUserEmail();
  const existingAuthor = eval_.author;

  // If author exists and doesn't match current user, reject
  if (existingAuthor && existingAuthor !== currentUserEmail) {
    res.status(403).json({
      error: 'Cannot modify author of an eval owned by another user',
    });
    return;
  }
}
```

## Edge Cases

### 1. User logged in but `currentUserEmail` is null

- Could happen if fetch fails or user cleared their email
- **Decision**: Be conservative - if cloud is enabled but we can't determine user email, don't allow editing (except for unclaimed evals)

### 2. Author field contains a name instead of email

- Some older evals might have display names
- **Decision**: Use strict comparison. If cloud is enabled and author doesn't match user email, don't allow editing.

### 3. Loading states

- While `cloudConfig` or `currentUserEmail` is loading
- **Decision**: Default to `editable={false}` during loading to prevent accidental edits, then update once loaded

### 4. User wants to transfer ownership

- Not directly supported
- **Decision**: Out of scope. User can ask the original author to change it, or they can duplicate the eval (already supported via copy feature)

## Implementation Checklist

- [ ] Update `ResultsView.tsx` to import `useCloudConfig`
- [ ] Add `canEditAuthor` memoized computation
- [ ] Pass `editable={canEditAuthor}` and `isCloudEnabled` to `AuthorChip`
- [ ] Update `AuthorChip` props interface to add `isCloudEnabled`
- [ ] Implement cloud-mode UI (Claim/Remove buttons instead of free text)
- [ ] Keep non-cloud mode UI (existing free text behavior)
- [ ] Update tooltips for all states
- [ ] Add tests for editability logic in ResultsView
- [ ] Update `AuthorChip.test.tsx` with cloud scenarios
- [ ] (Optional) Add server-side authorization check

## Files to Modify

1. `src/app/src/pages/eval/components/ResultsView.tsx`
   - Import `useCloudConfig`
   - Add `canEditAuthor` memoized computation
   - Pass `editable={canEditAuthor}` and `isCloudEnabled` props

2. `src/app/src/pages/eval/components/AuthorChip.tsx`
   - Add `isCloudEnabled` prop to interface
   - Implement `renderPopoverContent()` with cloud/non-cloud branches
   - Cloud mode: "Claim as mine" / "Remove my name" buttons
   - Non-cloud mode: existing TextField behavior
   - Update tooltip logic with `getTooltipTitle()`

3. `src/app/src/pages/eval/components/AuthorChip.test.tsx`
   - Test cloud mode: unclaimed eval shows "Claim" button
   - Test cloud mode: own eval shows "Remove" button
   - Test cloud mode: no free text field rendered
   - Test non-cloud mode: free text field still works
   - Test tooltip text for each state

4. (Optional) `src/server/routes/eval.ts`
   - Add authorization check to PATCH handler

## Testing Plan

### Unit Tests - ResultsView (canEditAuthor logic)

- `canEditAuthor` returns `true` when cloud disabled (any author state)
- `canEditAuthor` returns `true` when cloud enabled + no author
- `canEditAuthor` returns `true` when cloud enabled + author matches user
- `canEditAuthor` returns `false` when cloud enabled + author differs from user
- `canEditAuthor` returns `false` when cloud enabled + author set but currentUserEmail is null

### Unit Tests - AuthorChip (UI rendering)

**Cloud mode:**

- Renders "Claim as mine" button when `isCloudEnabled=true` and `author=null`
- Renders "Remove my name" button when `isCloudEnabled=true` and `author=currentUserEmail`
- Does NOT render TextField when `isCloudEnabled=true`
- "Claim" button calls `onEditAuthor(currentUserEmail)`
- "Remove" button calls `onEditAuthor('')`
- "Claim" button is disabled when `currentUserEmail` is null

**Non-cloud mode:**

- Renders TextField when `isCloudEnabled=false`
- TextField pre-fills with `currentUserEmail` when `author` is null
- Save button calls `onEditAuthor` with text field value

**Read-only mode:**

- Popover does not open when `editable=false`
- Tooltip shows "This eval belongs to {author}"

### Manual Testing

| Scenario                     | Expected Behavior                                       |
| ---------------------------- | ------------------------------------------------------- |
| Local, no cloud, no author   | Free text field, can type anything                      |
| Local, no cloud, has author  | Free text field, can edit to anything                   |
| Cloud login, no author       | "Claim as mine (you@email.com)" button                  |
| Cloud login, your eval       | "Remove my name" button                                 |
| Cloud login, teammate's eval | Cannot click, tooltip: "This eval belongs to alice@..." |

## Rollout Considerations

- This is a non-breaking change for local single-user workflows
- Self-hosted teams without cloud auth continue working as before
- Teams with cloud auth get the new protection automatically
- No migration needed - purely additive behavior

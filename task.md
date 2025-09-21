# Login Page and Authentication Redesign Task

## Current State Analysis

### Frontend Login Implementation (`src/app/src/pages/login.tsx`)

**Current Flow:**
1. Simple email-only authentication form
2. Two API calls on successful submission:
   - `POST /user/email` - Sets user email
   - `POST /user/consent` - Records consent with metadata
3. Stores email in global state via `useUserStore`
4. Redirects to dashboard or specified redirect URL

**Current Issues:**
- **No actual authentication** - just email verification/storage
- **Basic UI/UX** - minimal styling with MUI components
- **Limited error handling** - only console errors, no user feedback
- **No password/token validation** - purely email-based
- **Missing security features** - no rate limiting, CSRF protection, etc.

### CLI Authentication (`src/commands/auth.ts`)

**Current Flow:**
1. Supports API key-based authentication via `--api-key` flag
2. Validates API token against cloud service
3. Syncs email between API token and local config
4. Provides `login`, `logout`, `whoami`, and `can-create-targets` commands

**Key Features:**
- API key validation against external service
- Organization and team-based access control
- Proper token management and storage
- Error handling with descriptive messages

### API Routes (`src/server/routes/user.ts`)

**Current Endpoints:**
- `GET /user/email` - Retrieves stored email
- `POST /user/email` - Sets email and records telemetry/consent
- `GET /user/id` - Gets user ID
- `GET /user/email/status` - Checks email verification status

**Missing:**
- No `/user/consent` endpoint (referenced in frontend but doesn't exist)
- No proper authentication middleware
- No session management
- No API key validation endpoints

## Proposed Improvements

### 1. Authentication Architecture

**Goal:** Create a unified authentication system that works for both CLI and web interface.

**Components:**
- **API Key Management**: Centralized token validation and management
- **Session Handling**: Web session management with proper security
- **Organization/Team Integration**: Role-based access control
- **Security Middleware**: Rate limiting, CSRF protection, secure headers

### 2. Frontend Login Page Redesign

**UX/UI Improvements:**
- **Multi-step authentication flow**:
  1. Email input with validation
  2. API key/token input or magic link option
  3. Organization/team selection (if multiple)
  4. Dashboard redirect with welcome message

**Enhanced Features:**
- **Better error handling** with user-friendly toast notifications
- **Loading states** and progress indicators
- **Form validation** with real-time feedback
- **Responsive design** for mobile/tablet
- **Accessibility** improvements (ARIA labels, keyboard navigation)
- **Branding consistency** with promptfoo design system

**Security Enhancements:**
- **Input sanitization** and validation
- **Rate limiting** for login attempts
- **CSRF protection** for form submissions
- **Secure cookie** handling for session management

### 3. API Route Enhancements

**New Endpoints:**
```
POST /api/auth/login           # Handle email + API key login
POST /api/auth/logout          # Clear session and invalidate tokens
POST /api/auth/refresh         # Refresh authentication tokens
GET  /api/auth/status          # Check authentication status
POST /api/auth/verify-email    # Email verification flow
GET  /api/auth/organizations   # List user's organizations
GET  /api/auth/teams           # List user's teams
```

**Enhanced Existing Endpoints:**
- Add proper authentication middleware to all protected routes
- Implement the missing `/user/consent` endpoint
- Add request validation and error handling
- Include proper HTTP status codes and error messages

### 4. Unified Authentication Service

**Core Service (`src/auth/AuthService.ts`):**
- Handle API key validation against cloud service
- Manage local session state
- Provide authentication utilities for both CLI and web
- Handle organization/team switching
- Implement logout and token refresh logic

**Configuration Management:**
- Extend existing `globalConfig` to include web session data
- Secure storage for API tokens and session information
- Environment-specific configuration (dev/prod/self-hosted)

### 5. Testing Strategy

**Frontend Tests:**
- Unit tests for authentication components
- Integration tests for login flow
- E2E tests for complete authentication journey
- Accessibility testing with jest-axe

**Backend Tests:**
- API endpoint testing with proper authentication scenarios
- Security testing for rate limiting and CSRF protection
- Integration tests with mock cloud service responses
- Error handling and edge case testing

### 6. Migration Considerations

**Backward Compatibility:**
- Maintain existing CLI authentication flow
- Support both old and new web authentication methods during transition
- Graceful degradation for users with existing sessions

**Data Migration:**
- Migrate existing email-only users to new authentication system
- Handle existing telemetry and consent data
- Preserve user preferences and settings

## Implementation Plan

### Phase 1: Backend Foundation
1. Create authentication service architecture
2. Implement new API endpoints with proper validation
3. Add authentication middleware for protected routes
4. Create comprehensive test suite for authentication flow

### Phase 2: Frontend Redesign
1. Design new login page UI/UX mockups
2. Implement multi-step authentication form
3. Add proper error handling and user feedback
4. Integrate with new backend authentication APIs

### Phase 3: Security & Performance
1. Implement rate limiting and security middleware
2. Add CSRF protection and secure headers
3. Performance optimization and caching strategies
4. Security audit and penetration testing

### Phase 4: Integration & Testing
1. End-to-end testing of complete authentication flow
2. CLI and web interface integration testing
3. Organization/team switching functionality
4. Migration scripts and backward compatibility testing

### Phase 5: Documentation & Deployment
1. Update user documentation for new login flow
2. Create developer documentation for authentication APIs
3. Deployment guides for self-hosted installations
4. Monitoring and analytics setup for authentication metrics

## Success Criteria

1. **Unified Authentication**: CLI and web interface use the same authentication system
2. **Improved Security**: Proper token validation, session management, and security middleware
3. **Better UX**: Intuitive login flow with clear error messages and loading states
4. **Maintainability**: Well-tested, documented, and modular authentication code
5. **Backward Compatibility**: Existing users can continue using the system without disruption
6. **Performance**: Fast authentication flow with proper caching and optimization

## Risk Assessment

**High Risk:**
- Breaking existing CLI authentication during migration
- Data loss during user migration process
- Security vulnerabilities in new authentication system

**Medium Risk:**
- Performance impact of additional authentication checks
- Complexity of organization/team switching implementation
- Integration challenges with external cloud service

**Low Risk:**
- UI/UX changes requiring user education
- Testing coverage gaps
- Documentation updates
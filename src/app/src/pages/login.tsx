import { useActionState, useCallback, useEffect, useState } from 'react';

import logoPanda from '@app/assets/logo.svg';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { HelperText } from '@app/components/ui/helper-text';
import {
  KeyIcon,
  OpenInNewIcon,
  VisibilityIcon,
  VisibilityOffIcon,
} from '@app/components/ui/icons';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Spinner } from '@app/components/ui/spinner';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { cn } from '@app/lib/utils';
import { useUserStore } from '@app/stores/userStore';
import { callApi } from '@app/utils/api';
import { useLocation, useNavigate } from 'react-router-dom';

interface LoginState {
  success: boolean;
  error?: string;
  email?: string;
}

async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
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
    return { success: false, error: 'Network error. Please check your connection and try again.' };
  }
}

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

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const handleRedirect = useCallback(() => {
    // Handle special case where redirect URL contains query parameters
    // e.g., ?redirect=/some-page?param1=value1&param2=value2
    const searchStr = location.search;
    const redirectMatch = searchStr.match(/[?&]redirect=([^&]*(?:&[^=]*=[^&]*)*)/);
    let redirect = null;

    if (redirectMatch) {
      redirect = decodeURIComponent(redirectMatch[1]);
    } else {
      const params = new URLSearchParams(searchStr);
      redirect = params.get('redirect');
    }

    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      navigate(redirect);
    } else {
      navigate('/');
    }
  }, [location.search, navigate]);

  // Handle successful login
  useEffect(() => {
    if (state.success && state.email) {
      setEmail(state.email);
      handleRedirect();
    }
  }, [state.success, state.email, setEmail, handleRedirect]);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && email) {
      handleRedirect();
    }
  }, [isLoading, email, handleRedirect]);

  if (isLoading || (!isLoading && email)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Card className="p-8">
          {/* Logo and Header */}
          <div className="mb-8 flex flex-col items-center space-y-4 text-center">
            <div className="flex items-center gap-2">
              <img src={logoPanda} alt="Promptfoo" className="size-10" />
              <h1 className="text-2xl font-semibold tracking-tight">promptfoo</h1>
            </div>

            <h2 className="text-xl text-foreground">
              {new URLSearchParams(location.search).get('type') === 'report'
                ? 'View Report'
                : 'Welcome to Promptfoo'}
            </h2>

            <p className="max-w-sm text-sm text-muted-foreground">
              Enter your API token to authenticate.
              {!new URLSearchParams(location.search).get('type') && (
                <>
                  {' '}
                  Don't have one?{' '}
                  <a
                    href="https://promptfoo.app/welcome"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Generate your token here
                  </a>
                </>
              )}
            </p>
          </div>

          {/* Form */}
          <form action={formAction} noValidate>
            <div className="space-y-4">
              {/* API Key Field */}
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <KeyIcon className="size-4" />
                  </div>
                  <Input
                    id="apiKey"
                    name="apiKey"
                    type={showApiKey ? 'text' : 'password'}
                    required
                    autoFocus
                    autoComplete="new-password"
                    disabled={isPending}
                    className={cn(
                      'pl-10 pr-10',
                      state.error && 'border-destructive focus-visible:ring-destructive',
                    )}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label="toggle API key visibility"
                  >
                    {showApiKey ? (
                      <VisibilityOffIcon className="size-4" />
                    ) : (
                      <VisibilityIcon className="size-4" />
                    )}
                  </button>
                </div>
                {state.error && <HelperText error>{state.error}</HelperText>}
              </div>

              {/* API Host Field */}
              <div className="space-y-2">
                <Label htmlFor="customUrl">API Host</Label>
                <Input
                  id="customUrl"
                  name="customUrl"
                  type="url"
                  defaultValue="https://www.promptfoo.app"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Change this for private cloud or on-premise deployments
                </p>
              </div>

              {/* Submit Button */}
              <Button type="submit" className="w-full" size="lg" disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner size="sm" />
                    <span className="sr-only">Signing in...</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </div>
          </form>

          {/* Help Section */}
          <div className="mt-8 border-t border-border pt-6">
            <div className="flex flex-col items-center space-y-2 text-center">
              <p className="text-sm text-muted-foreground">Don't have an API key?</p>

              <a
                href="https://promptfoo.app/welcome"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Get your API key
                <OpenInNewIcon className="size-4" />
              </a>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

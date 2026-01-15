import { useEffect, useState } from 'react';

import logoPanda from '@app/assets/logo.svg';
import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Card } from '@app/components/ui/card';
import { GlobeIcon, TerminalIcon } from '@app/components/ui/icons';
import { Spinner } from '@app/components/ui/spinner';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { cn } from '@app/lib/utils';
import useApiConfig from '@app/stores/apiConfig';
import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DarkModeToggle from '../../components/DarkMode';

const DEFAULT_LOCAL_API_URL = 'http://localhost:15500';

export default function LauncherPage() {
  const [isConnecting, setIsConnecting] = useState(true);
  const [hasBeenConnected, setHasBeenConnected] = useState(false);
  const [isInitialConnection, setIsInitialConnection] = useState(true);
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState<boolean | null>(null);
  const {
    data: { status: healthStatus },
    refetch: checkHealth,
  } = useApiHealth();
  const { apiBaseUrl, setApiBaseUrl, enablePersistApiBaseUrl } = useApiConfig();
  usePageMeta({ title: 'Launcher', description: 'Connect to your API server' });

  useEffect(() => {
    if (!apiBaseUrl) {
      setApiBaseUrl(DEFAULT_LOCAL_API_URL);
      enablePersistApiBaseUrl();
    }
  }, [apiBaseUrl, setApiBaseUrl, enablePersistApiBaseUrl]);

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(savedMode === null ? prefersDarkMode : savedMode === 'true');
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prevMode) => {
      if (prevMode === null) {
        return prevMode;
      }
      const newMode = !prevMode;
      localStorage.setItem('darkMode', String(newMode));
      return newMode;
    });
  };

  useEffect(() => {
    if (darkMode === null) {
      return;
    }

    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [darkMode]);

  useEffect(() => {
    // Simple delay to allow server startup, then start health checks
    let interval: NodeJS.Timeout;
    const timeout = setTimeout(() => {
      checkHealth();
      interval = setInterval(() => {
        checkHealth();
      }, 2000);
    }, 3000);

    return () => {
      clearTimeout(timeout);
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [checkHealth]);

  useEffect(() => {
    if (healthStatus === 'connected') {
      setIsConnecting(false);
      setHasBeenConnected(true);
      // Only auto-navigate if this is the initial connection
      if (isInitialConnection) {
        setTimeout(() => {
          setIsInitialConnection(false);
          navigate('/eval');
        }, 1000);
      }
    } else if (healthStatus === 'blocked' || healthStatus === 'disabled') {
      setIsConnecting(true);
    }
  }, [healthStatus, navigate, isInitialConnection]);

  if (darkMode === null) {
    return null;
  }

  const showConnectionWarning =
    hasBeenConnected && !isInitialConnection && healthStatus === 'blocked';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10">
      {/* Connection lost warning */}
      <div
        className={cn(
          'fixed left-1/2 top-4 z-50 w-auto max-w-[90vw] -translate-x-1/2 transition-all duration-300',
          showConnectionWarning
            ? 'translate-y-0 opacity-100'
            : '-translate-y-4 opacity-0 pointer-events-none',
        )}
      >
        <Alert variant="warning">
          <AlertContent>
            <AlertDescription>
              Connection lost. Try visiting{' '}
              <a
                href="https://local.promptfoo.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:no-underline"
              >
                local.promptfoo.app
              </a>{' '}
              instead
            </AlertDescription>
          </AlertContent>
        </Alert>
      </div>

      {/* Dark mode toggle */}
      <div className="absolute right-4 top-4">
        <DarkModeToggle onToggleDarkMode={toggleDarkMode} />
      </div>

      {/* Header section */}
      <div className="mb-8 flex w-full max-w-[600px] flex-col items-center sm:mb-10">
        <img src={logoPanda} alt="Promptfoo Logo" className="mb-6 size-16 lg:size-20" />
        <h1 className="mb-6 text-center text-2xl font-light sm:text-3xl md:text-4xl">
          Welcome to Promptfoo
        </h1>

        <div
          className={cn(
            'flex items-center gap-2 text-base',
            isConnecting ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-500',
          )}
        >
          {isConnecting ? (
            <>
              Connecting to Promptfoo on localhost:15500
              <Spinner size="sm" />
            </>
          ) : (
            <>
              <CheckCircle className="size-4" />
              Connected to Promptfoo successfully!
            </>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="mb-8 grid w-full max-w-[600px] gap-6 sm:mb-10 lg:max-w-[1000px] lg:grid-cols-2">
        {/* Getting Started card */}
        <Card className="border border-border bg-transparent p-6">
          <div className="mb-4 flex items-center gap-3">
            <TerminalIcon className="size-5 text-primary" />
            <h2 className="text-xl font-light">Getting Started</h2>
          </div>
          <p className="mb-4 leading-relaxed text-muted-foreground">
            This app will proxy requests to <code className="text-sm">localhost:15500</code> by
            default. You can also visit{' '}
            <a
              href={DEFAULT_LOCAL_API_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              localhost:15500
            </a>{' '}
            directly.
          </p>
          <ol className="list-decimal space-y-4 pl-5">
            <li className="leading-relaxed">
              Check our{' '}
              <a
                href="https://promptfoo.dev/docs/installation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                installation guide
              </a>
            </li>
            <li className="leading-relaxed">
              <span className="mb-3 block text-muted-foreground">Run one of these commands:</span>
              <div className="rounded-md bg-muted/50 p-4 font-mono text-sm leading-relaxed dark:bg-muted/20">
                <div className="mb-1 text-muted-foreground">
                  # If you have promptfoo installed globally:
                </div>
                <div>promptfoo view -n</div>
                <div className="my-2">&nbsp;</div>
                <div className="mb-1 text-muted-foreground"># Or using npx:</div>
                <div>npx promptfoo@latest view -n</div>
              </div>
            </li>
          </ol>
        </Card>

        {/* Safari/Brave card */}
        <Card className="border border-border bg-transparent p-6">
          <div className="mb-4 flex items-center gap-3">
            <GlobeIcon className="size-5 text-primary" />
            <h2 className="text-xl font-light">Using Safari or Brave?</h2>
          </div>
          <p className="mb-4 leading-relaxed text-muted-foreground">
            Safari and Brave block access to localhost by default. You need to install mkcert and
            generate self-signed certificate:
          </p>
          <ol className="list-decimal space-y-4 pl-5">
            <li className="leading-relaxed">
              Follow the{' '}
              <a
                href="https://github.com/FiloSottile/mkcert#installation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                mkcert installation steps
              </a>
            </li>
            <li className="leading-relaxed">
              Run <code className="text-sm">mkcert -install</code>
            </li>
            <li className="leading-relaxed">Restart your browser</li>
          </ol>
          <p className="mt-6 border-t border-border pt-4 text-muted-foreground">
            On Brave you can disable Brave Shields.
          </p>
        </Card>
      </div>

      {/* Footer */}
      <div className="max-w-[600px] text-center">
        <p className="text-muted-foreground/70">
          Still experiencing issues? Feel free to{' '}
          <a
            href="https://github.com/promptfoo/promptfoo/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            open an issue
          </a>{' '}
          or join our{' '}
          <a
            href="https://discord.gg/promptfoo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Discord
          </a>
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logoPanda from '@app/assets/logo-panda.svg';
import useApiConfig from '@app/stores/apiConfig';
import { Terminal as TerminalIcon } from '@mui/icons-material';
import LanguageIcon from '@mui/icons-material/Language';
import {
  Box,
  Typography,
  Paper,
  Link,
  CircularProgress,
  useMediaQuery,
  styled,
  ThemeProvider,
  createTheme,
  Alert,
  Collapse,
} from '@mui/material';
import DarkModeToggle from '../../components/DarkMode';
import { useApiHealth } from '../../hooks/useApiHealth';

const DEFAULT_LOCAL_API_URL = 'http://localhost:15500';

const createAppTheme = (darkMode: boolean) =>
  createTheme({
    typography: {
      fontFamily: 'inherit',
    },
    palette: {
      mode: darkMode ? 'dark' : 'light',
      background: {
        default: darkMode ? '#1a1a1a' : '#ffffff',
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#121212' : '#fff',
            boxShadow: darkMode ? 'none' : '0 2px 3px rgba(0, 0, 0, 0.1)',
            borderRadius: '12px',
          },
        },
      },
    },
  });

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius * 2,
  border: `1px solid ${theme.palette.divider}`,
  backgroundColor: 'transparent',
}));

const StyledHeading = styled(Typography)(({ theme }) => ({
  fontWeight: 300,
  color: theme.palette.text.primary,
  fontSize: '1.25rem',
}));

const StyledText = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.secondary,
  fontSize: '1rem',
  lineHeight: 1.5,
}));

const CodeBlock = styled(Box)(({ theme }) => ({
  background: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  fontFamily: 'monospace',
  fontSize: '0.85rem',
  lineHeight: 1.6,
  '& div': {
    marginBottom: theme.spacing(0.5),
    '&:last-child': {
      marginBottom: 0,
    },
  },
}));

const ListItem = styled('li')(({ theme }) => ({
  marginBottom: theme.spacing(2),
  fontSize: '1rem',
  lineHeight: 1.5,
  '&:last-child': {
    marginBottom: 0,
  },
}));

export default function LauncherPage() {
  const [isConnecting, setIsConnecting] = useState(true);
  const [hasBeenConnected, setHasBeenConnected] = useState(false);
  const [isInitialConnection, setIsInitialConnection] = useState(true);
  const navigate = useNavigate();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState<boolean | null>(null);
  const isLargeScreen = useMediaQuery('(min-width:1200px)');
  const { status: healthStatus, checkHealth } = useApiHealth();
  const { apiBaseUrl, setApiBaseUrl, enablePersistApiBaseUrl } = useApiConfig();

  useEffect(() => {
    if (!apiBaseUrl) {
      setApiBaseUrl(DEFAULT_LOCAL_API_URL);
      enablePersistApiBaseUrl();
    }
  }, [apiBaseUrl, setApiBaseUrl, enablePersistApiBaseUrl]);

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    setDarkMode(savedMode === null ? prefersDarkMode : savedMode === 'true');
  }, [prefersDarkMode]);

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
    const interval = setInterval(() => {
      checkHealth();
    }, 2000);
    return () => clearInterval(interval);
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

  const theme = createAppTheme(darkMode);

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          height: '100vh',
          bgcolor: 'background.default',
          color: 'text.primary',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: { xs: 4, sm: 5 },
          px: { xs: 2, sm: 3 },
          position: 'relative',
        }}
      >
        <Collapse
          in={hasBeenConnected && !isInitialConnection && healthStatus === 'blocked'}
          sx={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            width: 'auto',
            maxWidth: '90vw',
          }}
        >
          <Alert severity="warning" sx={{ mb: 2 }}>
            Connection lost. Try visiting{' '}
            <Link href="https://local.promptfoo.app" target="_blank" rel="noopener">
              local.promptfoo.app
            </Link>{' '}
            instead
          </Alert>
        </Collapse>

        <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
          <DarkModeToggle onToggleDarkMode={toggleDarkMode} />
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: { xs: 4, sm: 5 },
            maxWidth: '600px',
            width: '100%',
          }}
        >
          <img
            src={logoPanda}
            alt="Promptfoo Logo"
            style={{
              width: isLargeScreen ? '80px' : '64px',
              height: isLargeScreen ? '80px' : '64px',
              marginBottom: theme.spacing(3),
            }}
          />
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 300,
              textAlign: 'center',
              mb: 3,
              fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.5rem' },
            }}
          >
            Welcome to Promptfoo
          </Typography>

          <StyledText
            variant="h6"
            sx={{
              color: isConnecting ? 'text.secondary' : 'success.main',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {isConnecting ? (
              <>
                Connecting to Promptfoo on localhost:15500
                <CircularProgress size={16} color="inherit" />
              </>
            ) : (
              'Connected to Promptfoo successfully!'
            )}
          </StyledText>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: { xs: 3, sm: 4 },
            maxWidth: { xs: '600px', lg: '1000px' },
            width: '100%',
            mb: { xs: 4, sm: 5 },
          }}
        >
          <StyledPaper elevation={0}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <TerminalIcon color="primary" fontSize="small" />
              <StyledHeading>Getting Started</StyledHeading>
            </Box>
            <StyledText sx={{ mb: 2 }}>
              This app will proxy requests to <code>localhost:15500</code> by default. You can also
              visit{' '}
              <Link href={DEFAULT_LOCAL_API_URL} target="_blank">
                localhost:15500
              </Link>{' '}
              directly.
            </StyledText>
            <Box component="ol" sx={{ pl: 2.5 }}>
              <ListItem>
                Check our{' '}
                <Link href="https://promptfoo.dev/docs/installation" target="_blank">
                  installation guide
                </Link>
              </ListItem>
              <ListItem>
                <StyledText sx={{ mb: 1.5 }}>Run one of these commands:</StyledText>
                <CodeBlock>
                  <div># If you have promptfoo installed globally:</div>
                  <div>promptfoo view -n</div>
                  <div>&nbsp;</div>
                  <div># Or using npx:</div>
                  <div>npx promptfoo@latest view -n</div>
                </CodeBlock>
              </ListItem>
            </Box>
          </StyledPaper>

          <StyledPaper elevation={0}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <LanguageIcon color="primary" fontSize="small" />
              <StyledHeading>Using Safari or Brave?</StyledHeading>
            </Box>
            <StyledText sx={{ mb: 2 }}>
              Safari and Brave block access to localhost by default. You need to install mkcert and
              generate self-signed certificate:
            </StyledText>
            <Box component="ol" sx={{ pl: 2.5 }}>
              <ListItem>
                Follow the{' '}
                <Link href="https://github.com/FiloSottile/mkcert#installation" target="_blank">
                  mkcert installation steps
                </Link>
              </ListItem>
              <ListItem>
                Run <code>mkcert -install</code>
              </ListItem>
              <ListItem>Restart your browser</ListItem>
            </Box>
            <StyledText
              sx={{
                mt: 3,
                pt: 2,
                borderTop: `1px solid ${theme.palette.divider}`,
              }}
            >
              On Brave you can disable Brave Shields.
            </StyledText>
          </StyledPaper>
        </Box>

        <Box sx={{ textAlign: 'center', maxWidth: '600px' }}>
          <StyledText sx={{ color: 'text.disabled' }}>
            Still experiencing issues? Feel free to{' '}
            <Link href="https://github.com/promptfoo/promptfoo/issues" target="_blank">
              open an issue
            </Link>{' '}
            or join our{' '}
            <Link href="https://discord.gg/promptfoo" target="_blank">
              Discord
            </Link>
          </StyledText>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

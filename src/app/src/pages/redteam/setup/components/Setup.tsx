import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
interface SetupProps {
  open: boolean;
  onClose: () => void;
  highlightConfigName?: boolean;
  setHighlightConfigName?: (highlight: boolean) => void;
  configName: string;
  setConfigName: (name: string) => void;
}

export default function Setup({
  open,
  onClose,
  highlightConfigName,
  setHighlightConfigName,
  configName,
  setConfigName,
}: SetupProps) {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="setup-dialog-title"
      aria-describedby="setup-dialog-description"
      maxWidth="md"
      fullWidth
    >
      <DialogTitle id="setup-dialog-title">
        Name Your Configuration
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: theme.spacing(1),
            top: theme.spacing(1),
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Enter a name for this red team configuration.
        </Typography>
        <TextField
          fullWidth
          label="Configuration Name"
          placeholder="My Red Team Configuration"
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
          autoFocus
          error={Boolean(highlightConfigName && !configName)}
          helperText={highlightConfigName && !configName ? 'Configuration name is required' : ''}
          onFocus={() => setHighlightConfigName?.(false)}
        />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 4,
          }}
        >
          <Link
            href="https://www.promptfoo.dev/docs/red-team/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textDecoration: 'none', color: theme.palette.primary.main }}
          >
            Learn more about LLM red teaming
          </Link>
          <Button
            variant="contained"
            endIcon={<KeyboardArrowRightIcon />}
            onClick={() => {
              if (!configName) {
                setHighlightConfigName?.(true);
                return;
              }
              onClose();
            }}
            sx={{
              backgroundColor: theme.palette.primary.main,
              '&:hover': { backgroundColor: theme.palette.primary.dark },
              px: 4,
              py: 1,
            }}
            disabled={!configName}
          >
            Continue
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

import BugReportIcon from '@mui/icons-material/BugReport';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ForumIcon from '@mui/icons-material/Forum';
import GitHubIcon from '@mui/icons-material/GitHub';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import TagIcon from '@mui/icons-material/Tag';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import Link from 'next/link';

const links = [
  {
    icon: <MenuBookIcon fontSize="small" />,
    text: 'Documentation',
    href: 'https://www.promptfoo.dev/docs/intro',
  },
  {
    icon: <GitHubIcon fontSize="small" />,
    text: 'GitHub Repository',
    href: 'https://github.com/promptfoo/promptfoo',
  },
  {
    icon: <BugReportIcon fontSize="small" />,
    text: 'File an Issue',
    href: 'https://github.com/promptfoo/promptfoo/issues',
  },
  {
    icon: <ForumIcon fontSize="small" />,
    text: 'Join Our Discord Community',
    href: 'https://discord.gg/gHPS9jjfbs',
  },
  {
    icon: <CalendarTodayIcon fontSize="small" />,
    text: 'Book a Meeting',
    href: 'https://cal.com/team/promptfoo/intro',
  },
];

export function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="about-promptfoo-dialog-title"
      PaperProps={{
        sx: {
          bgcolor: theme.palette.background.paper,
          color: theme.palette.text.primary,
        },
      }}
    >
      <DialogTitle id="about-promptfoo-dialog-title">
        <Stack>
          <Typography variant="h6">About Promptfoo</Typography>
          <Typography variant="subtitle2">
            <Link href='https://github.com/promptfoo/promptfoo/releases'>Version {process.env.PROMPTFOO_VERSION}</Link>
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" gutterBottom>
          Promptfoo is a MIT licensed open-source tool for evaluating LLMs. We make it easy to track
          the performance of your models and prompts over time with automated support for dataset
          generation and grading.
        </Typography>
        <Stack spacing={2} mt={2}>
          {links.map((item, index) => (
            <Link key={index} href={item.href} target="_blank" passHref>
              <MuiLink
                color="inherit"
                underline="none"
                sx={{
                  '&:hover': {
                    textDecoration: 'underline',
                  },
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{
                    flexWrap: 'wrap',
                    '& .MuiSvgIcon-root': {
                      fontSize: '1rem',
                    },
                  }}
                >
                  {item.icon}
                  <Typography variant="body2">{item.text}</Typography>
                </Stack>
              </MuiLink>
            </Link>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

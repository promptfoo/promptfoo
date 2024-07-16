import BugReportIcon from '@mui/icons-material/BugReport';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ForumIcon from '@mui/icons-material/Forum';
import GitHubIcon from '@mui/icons-material/GitHub';
import MenuBookIcon from '@mui/icons-material/MenuBook';
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

const links: { icon: React.ReactNode; text: string; href: string }[] = [
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

export default function InfoModal<T extends { open: boolean; onClose: () => void }>({
  open,
  onClose,
}: T) {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="about-promptfoo-dialog-title"
    >
      <DialogTitle id="about-promptfoo-dialog-title">
        <Stack>
          <Typography variant="h6" color="text.primary">
            About Promptfoo
          </Typography>
          <Link
            href="https://github.com/promptfoo/promptfoo/releases"
            passHref
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <MuiLink
              underline="none"
              sx={{
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              <Typography variant="subtitle2" color="text.primary">
                Version {process.env.PROMPTFOO_VERSION}
              </Typography>
            </MuiLink>
          </Link>
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
            <Stack
              key={index}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                flexWrap: 'wrap',
                '& .MuiSvgIcon-root': {
                  fontSize: '1rem',
                  color: 'text.primary',
                },
              }}
            >
              {item.icon}
              <Link
                href={item.href}
                target="_blank"
                passHref
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <MuiLink
                  color="text.primary"
                  underline="none"
                  sx={{
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  }}
                >
                  <Typography variant="body2" color="text.primary">
                    {item.text}
                  </Typography>
                </MuiLink>
              </Link>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

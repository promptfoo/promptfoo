import BugReportIcon from '@mui/icons-material/BugReport';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ForumIcon from '@mui/icons-material/Forum';
import GitHubIcon from '@mui/icons-material/GitHub';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { Box, Modal, Typography } from '@mui/material';
import Link from 'next/link';
import './InfoModal.css';

export function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} className="info-modal">
      <Box className="info-modal-content">
        <Typography component="h2" variant="h5" className="info-modal-title">
          About Promptfoo
        </Typography>
        <Typography component="p" variant="body2" className="info-modal-description">
          Promptfoo is a MIT licensed open-source tool for evaluating LLMs. We make it easy to track
          the performance of your models and prompts over time with automated support for dataset
          generation and grading.
        </Typography>
        <Typography component="h5" variant="h6" sx={{ marginTop: '.2em' }}>
          <Link
            href="https://github.com/promptfoo/promptfoo/releases"
            target="_blank"
            className="info-modal-link"
          >
            Version {process.env.PROMPTFOO_VERSION}
          </Link>
        </Typography>
        <Link
          href="https://www.promptfoo.dev/docs/intro"
          target="_blank"
          className="info-modal-link"
        >
          <MenuBookIcon fontSize="small" /> Documentation
        </Link>
        <Link
          href="https://github.com/promptfoo/promptfoo"
          target="_blank"
          className="info-modal-link"
        >
          <GitHubIcon fontSize="small" /> GitHub Repository
        </Link>
        <Link
          href="https://github.com/promptfoo/promptfoo/issues"
          target="_blank"
          className="info-modal-link"
        >
          <BugReportIcon fontSize="small" /> File an Issue
        </Link>
        <Link href="https://discord.gg/gHPS9jjfbs" target="_blank" className="info-modal-link">
          <ForumIcon fontSize="small" /> Join Our Discord Community
        </Link>
        <Link
          href="https://cal.com/team/promptfoo/intro"
          target="_blank"
          className="info-modal-link"
        >
          <CalendarTodayIcon fontSize="small" /> Book a Meeting
        </Link>
      </Box>
    </Modal>
  );
}

import BugReportIcon from '@mui/icons-material/BugReport';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ForumIcon from '@mui/icons-material/Forum';
import GitHubIcon from '@mui/icons-material/GitHub';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { Modal } from '@mui/material';
import Link from 'next/link';
import './InfoModal.css';

export function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} className="info-modal">
      <div className="info-modal-content">
        <h2 className="info-modal-title">About Promptfoo</h2>
        <p className="info-modal-description">
          Promptfoo is a MIT licensed open-source tool for evaluating LLMs. We make it easy to track
          the performance of your models and prompts over time with automated support for dataset
          generation and grading.
        </p>
        <p className="info-modal-version">
          <Link
            href="https://github.com/promptfoo/promptfoo/releases"
            target="_blank"
            className="info-modal-link"
          >
            Version {process.env.PROMPTFOO_VERSION}
          </Link>
        </p>
        <div className="info-modal-links">
          <Link href="/docs" target="_blank" className="info-modal-link">
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
        </div>
      </div>
    </Modal>
  );
}

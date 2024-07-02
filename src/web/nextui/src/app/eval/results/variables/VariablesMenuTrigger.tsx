import SettingsIcon from '@mui/icons-material/Settings';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useVariablesContext } from './VariablesProvider';
import { VARIABLES_MENU_TRIGGER_BUTTON_ID } from './constants';

// ====================================================
// Types
// ====================================================

type Props = {};

// ====================================================
// Constants
// ====================================================

const HELPER_TEXT = 'Variables settings';

// ====================================================
// Component
// ====================================================

export default function VariablesMenuTrigger({}: Props) {
  const { settingsMenu } = useVariablesContext();

  // ====================================================
  // Event Handlers
  // ====================================================

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    settingsMenu.toggle();
  }

  // ====================================================
  // Render
  // ====================================================

  return (
    <Tooltip title={HELPER_TEXT}>
      <IconButton
        id={VARIABLES_MENU_TRIGGER_BUTTON_ID}
        color="primary"
        size="small"
        onClick={handleClick}
        aria-controls={settingsMenu.display ? 'basic-menu' : undefined}
        aria-expanded={settingsMenu.display ? 'true' : undefined}
        aria-haspopup="true"
        aria-label={HELPER_TEXT}
        ref={settingsMenu.anchorEl}
      >
        <SettingsIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  );
}

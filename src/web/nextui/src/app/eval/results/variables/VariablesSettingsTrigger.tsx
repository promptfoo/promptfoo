import SettingsIcon from '@mui/icons-material/Settings';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useVariablesSettingsContext } from './VariablesSettingsProvider';
import { VARIABLES_MENU_TRIGGER_BUTTON_ID } from './constants';

// ====================================================
// Types
// ====================================================

type Props = {};

// ====================================================
// Component
// ====================================================

export default function VariablesSettingsTrigger({}: Props) {
  const { settingsMenu } = useVariablesSettingsContext();

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
    <Tooltip title="Variables settings" placement="bottom">
      <Button color="primary" onClick={handleClick} startIcon={<SettingsIcon />}>
        Variable Settings
      </Button>
    </Tooltip>
  );
}

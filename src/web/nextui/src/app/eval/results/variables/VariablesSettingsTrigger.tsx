import SettingsIcon from '@mui/icons-material/Settings';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { useVariablesSettingsContext } from './VariablesSettingsProvider';

// ====================================================
// Types
// ====================================================

type Props = {};

// ====================================================
// Component
// ====================================================

export default function VariablesSettingsTrigger(props: Props) {
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

import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import { useVariablesSettingsContext } from './VariablesSettingsProvider';

type Props = {};

export default function VariablesSettingsModal({}: Props) {
  const { settingsMenu, variableColumns, toggleColumnVisibility } = useVariablesSettingsContext();

  return (
    <Dialog open={settingsMenu.display} onClose={settingsMenu.toggle} fullWidth maxWidth="sm">
      <DialogTitle>Variable Settings</DialogTitle>
      <DialogContent>
        <Box>
          {variableColumns.map((column, index) => (
            <div
              key={column.label}
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 6px',
              }}
            >
              <span>{column.label}</span>
              <IconButton
                onClick={() => toggleColumnVisibility(index)}
                color={column.visible ? 'primary' : 'default'}
              >
                <VisibilityIcon />
              </IconButton>
            </div>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={settingsMenu.toggle}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

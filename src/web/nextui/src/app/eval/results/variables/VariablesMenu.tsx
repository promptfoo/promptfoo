import { memo } from 'react';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import { useVariablesContext } from './VariablesProvider';
import { VARIABLES_MENU_TRIGGER_BUTTON_ID } from './constants';

type Props = {};

function VariablesMenu({}: Props) {
  const { settingsMenu, variableColumns, toggleColumnVisibility } = useVariablesContext();

  return (
    <Menu
      anchorEl={settingsMenu.anchorEl?.current}
      open={settingsMenu.display}
      onClose={settingsMenu.toggle}
      MenuListProps={{
        'aria-labelledby': VARIABLES_MENU_TRIGGER_BUTTON_ID,
      }}
    >
      <div
        style={{
          padding: '4px',
          fontWeight: 'bold',
        }}
      >
        Visible
      </div>
      <Divider />
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
          <Checkbox checked={column.visible} onChange={() => toggleColumnVisibility(index)} />
        </div>
      ))}
    </Menu>
  );
}

export default memo(VariablesMenu);

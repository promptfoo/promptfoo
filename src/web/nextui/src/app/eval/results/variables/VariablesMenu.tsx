import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useVariablesContext } from './VariablesProvider';
import { VARIABLES_MENU_TRIGGER_BUTTON_ID } from './constants';

type Props = {
  display: boolean;
};

export default function VariablesMenu({ display }: Props) {
  const { settingsMenu } = useVariablesContext();

  return (
    <Menu
      anchorEl={settingsMenu.anchorEl}
      open={settingsMenu.display}
      onClose={settingsMenu.toggle}
      MenuListProps={{
        'aria-labelledby': VARIABLES_MENU_TRIGGER_BUTTON_ID,
      }}
    >
      <MenuItem>Hello World</MenuItem>
    </Menu>
  );
}

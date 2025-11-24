import { forwardRef } from 'react';

import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Badge, { badgeClasses } from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

const CountBadge = styled(Badge)`
  & .${badgeClasses.badge} {
    top: -8px;
    right: -8px;
    min-width: 16px;
    height: 16px;
    font-size: 0.75rem;
  }
`;

interface FiltersButtonProps {
  appliedFiltersCount: number;
  onClick: () => void;
}

const FiltersButton = forwardRef<HTMLButtonElement, FiltersButtonProps>(
  ({ appliedFiltersCount, onClick }, ref) => {
    return (
      <Tooltip title="Filters" placement="bottom">
        <IconButton onClick={onClick} ref={ref}>
          <FilterAltIcon fontSize="small" />
          <CountBadge badgeContent={appliedFiltersCount} color="primary" overlap="circular" />
        </IconButton>
      </Tooltip>
    );
  },
);

FiltersButton.displayName = 'FiltersButton';

export default FiltersButton;

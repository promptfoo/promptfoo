import React from 'react';

import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Badge, { badgeClasses } from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

const CountBadge = styled(Badge)`
  & .${badgeClasses.badge} {
    top: -12px;
    right: -6px;
  }
`;

const FiltersButton = React.forwardRef<
  HTMLButtonElement,
  {
    appliedFiltersCount: number;
    onClick: () => void;
  }
>(({ appliedFiltersCount, onClick }, ref) => {
  return (
    <Tooltip title="Filters" placement="bottom">
      <IconButton onClick={onClick} ref={ref}>
        <FilterAltIcon fontSize="small" />
        <CountBadge badgeContent={appliedFiltersCount} color="primary" overlap="circular" />
      </IconButton>
    </Tooltip>
  );
});

FiltersButton.displayName = 'FiltersButton';

export default FiltersButton;

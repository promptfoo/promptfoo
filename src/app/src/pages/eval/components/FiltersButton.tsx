import React from 'react';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Badge from '@mui/material/Badge';
import { badgeClasses } from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';

const CountBadge = styled(Badge)`
  & .${badgeClasses.badge} {
    top: -12px;
    right: -6px;
  }
`;

const FiltersButton = React.forwardRef<
  HTMLButtonElement,
  {
    // TODO: Show a tooltip with the applied filters
    appliedFiltersCount: number;
    onClick: () => void;
  }
>(({ appliedFiltersCount, onClick }, ref) => {
  return (
    <IconButton onClick={onClick} ref={ref}>
      <FilterAltIcon fontSize="small" />
      <CountBadge badgeContent={appliedFiltersCount} color="primary" overlap="circular" />
    </IconButton>
  );
});

FiltersButton.displayName = 'FiltersButton';

export default FiltersButton;

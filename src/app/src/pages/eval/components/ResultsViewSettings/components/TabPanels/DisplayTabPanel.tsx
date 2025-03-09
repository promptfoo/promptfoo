import React from 'react';
import { Box, Fade, alpha } from '@mui/material';
import { SettingsSection, SettingItem } from '..';
import { useStore as useResultsViewStore } from '../../store';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewListIcon from '@mui/icons-material/ViewList';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import SpeedIcon from '@mui/icons-material/Speed';
import { tokens } from '../../tokens';

interface DisplayTabPanelProps {
  id: string;
}

const DisplayTabPanel: React.FC<DisplayTabPanelProps> = ({ id }) => {
  const {
    stickyHeader,
    setStickyHeader,
    showPrompts,
    setShowPrompts,
    showPassFail,
    setShowPassFail,
    showInferenceDetails,
    setShowInferenceDetails,
  } = useResultsViewStore();

  return (
    <Fade in timeout={tokens.animation.medium}>
      <Box 
        role="tabpanel" 
        id={id} 
        aria-labelledby={`tab-${id}`}
        sx={{ 
          py: tokens.spacing.padding.compact,
          px: tokens.spacing.padding.item,
          height: '100%',
          overflowY: 'auto',
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: (theme) => alpha(theme.palette.text.secondary, 0.2),
            borderRadius: '10px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: (theme) => alpha(theme.palette.text.secondary, 0.3),
          },
        }}
      >
        <SettingsSection
          title="Layout Options"
          icon={<TableRowsIcon />}
          description="Control how the table is displayed and organized"
        >
          <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
            <SettingItem
              label="Sticky header"
              checked={stickyHeader}
              onChange={setStickyHeader}
              icon={<ViewListIcon fontSize="small" />}
              tooltipText="Keep the header at the top of the screen when scrolling through the table"
            />
          </Box>
        </SettingsSection>

        <SettingsSection
          title="Element Visibility"
          icon={<VisibilityIcon />}
          description="Control what content appears in each table cell"
        >
          <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
            <SettingItem
              label="Show full prompts in output cells"
              checked={showPrompts}
              onChange={setShowPrompts}
              tooltipText="Display the final prompt that produced each output in its cell"
            />

            <SettingItem
              label="Show pass/fail indicators"
              checked={showPassFail}
              onChange={setShowPassFail}
              icon={<DoneAllIcon fontSize="small" />}
              tooltipText="Display success/failure status indicators for each test result"
            />

            <SettingItem
              label="Show inference details"
              checked={showInferenceDetails}
              onChange={setShowInferenceDetails}
              icon={<SpeedIcon fontSize="small" />}
              tooltipText="Display detailed inference statistics such as latency, tokens used, cost, etc."
            />
          </Box>
        </SettingsSection>
      </Box>
    </Fade>
  );
};

export default React.memo(DisplayTabPanel); 
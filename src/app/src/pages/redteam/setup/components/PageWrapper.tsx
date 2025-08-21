import React, { useEffect, useRef, useState } from 'react';

import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { alpha, styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { SIDEBAR_WIDTH } from '../page';

interface PageWrapperProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  warningMessage?: string;
}

const Root = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  width: '100%',
  overflow: 'hidden',
}));

const ContentContainer = styled(Box)({
  flex: 1,
  overflow: 'auto',
  position: 'relative',
  height: 0, // This forces flex child to respect flex: 1
});

const HeaderContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isMinimized',
})<{ isMinimized: boolean }>(({ theme, isMinimized }) => ({
  position: 'sticky',
  top: 0,
  zIndex: 10,
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.default, 0.9)
      : alpha(theme.palette.background.default, 0.95),
  backdropFilter: 'blur(8px)',
  borderBottom: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(isMinimized ? 1.5 : 3, 3),
  transition: theme.transitions.create(['padding'], {
    duration: theme.transitions.duration.short,
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const TitleTypography = styled(Typography, {
  shouldForwardProp: (prop) => prop !== 'isMinimized',
})<{ isMinimized: boolean }>(({ theme, isMinimized }) => ({
  fontSize: isMinimized ? '1.25rem' : '2rem',
  fontWeight: 600,
  color: theme.palette.text.primary,
  transition: theme.transitions.create(['font-size'], {
    duration: theme.transitions.duration.short,
    easing: theme.transitions.easing.easeInOut,
  }),
  marginBottom: isMinimized ? 0 : theme.spacing(1),
}));

const DescriptionTypography = styled(Typography, {
  shouldForwardProp: (prop) => prop !== 'isVisible',
})<{ isVisible: boolean }>(({ theme, isVisible }) => ({
  fontSize: '1rem',
  color: theme.palette.text.secondary,
  opacity: isVisible ? 1 : 0,
  maxHeight: isVisible ? '100px' : 0,
  overflow: 'hidden',
  transition: theme.transitions.create(['opacity', 'max-height'], {
    duration: theme.transitions.duration.short,
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const ContentBox = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  marginBottom: '200px', // Space for fixed navigation
}));

const NavigationContainer = styled(Box)(({ theme }) => ({
  position: 'fixed',
  bottom: 0,
  left: SIDEBAR_WIDTH, // Account for sidebar width
  right: 0,
  zIndex: 15,
  backgroundColor: alpha(theme.palette.background.paper, 0.95),
  backdropFilter: 'blur(8px)',
  borderTop: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(2, 3),
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}));

export default function PageWrapper({
  title,
  description,
  children,
  onNext,
  onBack,
  nextLabel = 'Next',
  backLabel = 'Back',
  nextDisabled = false,
  backDisabled = false,
  warningMessage,
}: PageWrapperProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        const scrollTop = contentRef.current.scrollTop;
        // Minimize header after scrolling 50px
        setIsMinimized(scrollTop > 50);
      }
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.addEventListener('scroll', handleScroll);
      return () => contentElement.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <Root>
      <HeaderContainer isMinimized={isMinimized}>
        <TitleTypography variant="h4" isMinimized={isMinimized}>
          {title}
        </TitleTypography>
        {description && (
          <DescriptionTypography variant="body1" isVisible={!isMinimized}>
            {description}
          </DescriptionTypography>
        )}
      </HeaderContainer>
      <ContentContainer ref={contentRef}>
        <ContentBox>{children}</ContentBox>
      </ContentContainer>

      {onBack || onNext ? (
        <NavigationContainer>
          <Box>
            {onBack && (
              <Button
                variant="outlined"
                onClick={onBack}
                startIcon={<KeyboardArrowLeftIcon />}
                disabled={backDisabled}
                sx={{ px: 4, py: 1 }}
              >
                {backLabel}
              </Button>
            )}
          </Box>
          <Box>
            {onNext && (
              <Tooltip title={warningMessage || ''} arrow placement="top">
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    cursor: nextDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={onNext}
                    endIcon={<KeyboardArrowRightIcon />}
                    disabled={nextDisabled}
                    sx={{
                      px: 4,
                      py: 1,
                      mr: '72px',
                      pointerEvents: nextDisabled ? 'none' : 'auto',
                    }}
                  >
                    {nextLabel}
                  </Button>
                </Box>
              </Tooltip>
            )}
          </Box>
        </NavigationContainer>
      ) : null}
    </Root>
  );
}

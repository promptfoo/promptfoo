import React from 'react';
import { Link } from 'react-router-dom';
import logoPanda from '@app/assets/logo-panda.svg';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

const LogoWrapper = styled(Box)(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: theme.spacing(1, 2),
  perspective: '2000px',
  transformStyle: 'preserve-3d',
}));

const LogoText = styled(Typography)(({ theme }) => ({
  fontFamily: '"Inter", sans-serif',
  fontWeight: 600,
  fontSize: '1rem',
  color: theme.palette.text.primary,
  letterSpacing: '0.02em',
  marginLeft: theme.spacing(1),
  transition: 'all 0.3s ease',
  '@keyframes rainbow': {
    '0%': { backgroundPosition: '0% 50%' },
    '50%': { backgroundPosition: '100% 50%' },
    '100%': { backgroundPosition: '0% 50%' },
  },
  '&:hover': {
    color: 'transparent',
    backgroundImage:
      'linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8f00ff)',
    backgroundSize: '300% 300%',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    animation: 'rainbow 3s ease infinite',
  },
}));

const LogoIcon = styled('img')({
  width: '25px',
  height: 'auto',
  transition: 'all 1s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  '@keyframes absoluteMadness': {
    '0%': {
      transform: 'translateY(0) rotate(0deg) scale(1) translateX(0)',
      filter: 'hue-rotate(0deg) brightness(1)',
    },
    '25%': {
      transform: 'translateY(-25px) rotate(360deg) scale(1.5) translateX(15px)',
      filter: 'hue-rotate(180deg) brightness(1.5)',
    },
    '50%': {
      transform: 'translateY(0) rotate(720deg) scale(0.5) translateX(-15px)',
      filter: 'hue-rotate(360deg) brightness(2)',
    },
    '75%': {
      transform: 'translateY(25px) rotate(1080deg) scale(1.8) translateX(15px)',
      filter: 'hue-rotate(540deg) brightness(1.5)',
    },
    '100%': {
      transform: 'translateY(0) rotate(1440deg) scale(1) translateX(0)',
      filter: 'hue-rotate(720deg) brightness(1)',
    },
  },
  '@keyframes vibrate': {
    '0%, 100%': { transform: 'translate(0)' },
    '10%, 30%, 50%, 70%, 90%': { transform: 'translate(-2px, 2px)' },
    '20%, 40%, 60%, 80%': { transform: 'translate(2px, -2px)' },
  },
  '&:hover': {
    animation:
      'absoluteMadness 2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite, vibrate 0.3s linear infinite',
    filter:
      'hue-rotate(720deg) brightness(2) contrast(1.5) saturate(300%) drop-shadow(0 0 10px rgba(255,0,0,0.5))',
  },
});

export default function Logo() {
  return (
    <Link to="/" style={{ textDecoration: 'none' }}>
      <LogoWrapper>
        <LogoIcon src={logoPanda} alt="Promptfoo Logo" />
        <LogoText variant="h1">promptfoo</LogoText>
      </LogoWrapper>
    </Link>
  );
}

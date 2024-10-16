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
  transition: theme.transitions.create(['transform']),
  '&:hover': {
    transform: 'translateY(-2px)',
  },
}));

const LogoText = styled(Typography)(({ theme }) => ({
  fontFamily: '"Inter", sans-serif',
  fontWeight: 600,
  fontSize: '1rem',
  color: theme.palette.text.primary,
  letterSpacing: '0.02em',
  marginLeft: theme.spacing(1),
}));

const LogoIcon = styled('img')({
  width: '25px',
  height: 'auto',
});

export default function Logo() {
  return (
    <Link to="https://promptfoo.dev" style={{ textDecoration: 'none' }}>
      <LogoWrapper>
        <LogoIcon src={logoPanda} alt="Promptfoo Logo" />
        <LogoText variant="h1">promptfoo</LogoText>
      </LogoWrapper>
    </Link>
  );
}

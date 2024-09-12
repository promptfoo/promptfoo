import { Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import logoPanda from '../assets/logo-panda.svg';
import './Logo.css';

export default function Logo() {
  return (
    <Link to="https://promptfoo.dev">
      <Box className="logo" component="a">
        <img width={25} height={25} src={logoPanda} alt="Promptfoo logo" /> <span>promptfoo</span>
      </Box>
    </Link>
  );
}

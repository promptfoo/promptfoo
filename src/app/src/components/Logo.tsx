import { Link } from 'react-router-dom';
import logoPanda from '@app/assets/logo-panda.svg';
import Box from '@mui/material/Box';
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

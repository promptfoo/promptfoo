import Box from '@mui/material/Box';
import Image from 'next/image';
import Link from 'next/link';
import './Logo.css';

export default function Logo() {
  return (
    <Link href="https://promptfoo.dev" passHref>
      <Box className="logo" component="a">
        <Image width={25} height={25} src="/logo-panda.svg" alt="Promptfoo logo" />{' '}
        <span>promptfoo</span>
      </Box>
    </Link>
  );
}

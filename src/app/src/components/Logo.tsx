import logoPanda from '@app/assets/logo.svg';
import { Link } from 'react-router-dom';

import './Logo.css';

export default function Logo() {
  return (
    <Link
      to="/"
      className="hidden shrink-0 items-center px-2 py-1 no-underline perspective-[2000px] min-[360px]:inline-flex"
    >
      <img
        src={logoPanda}
        alt="Promptfoo Logo"
        className="logo-icon w-[25px] h-auto transition-all duration-1000 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)]"
      />
      <span className="logo-text ml-2 hidden font-['Inter',sans-serif] text-base font-semibold tracking-[0.02em] text-foreground transition-all duration-300 sm:inline">
        promptfoo
      </span>
    </Link>
  );
}

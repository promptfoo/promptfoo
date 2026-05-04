import logoPanda from '@app/assets/logo.svg';
import { Link } from 'react-router-dom';

import './Logo.css';

export default function Logo() {
  return (
    <Link
      to="/"
      className="inline-flex items-center px-0 py-1 no-underline perspective-[2000px] sm:px-2"
    >
      <img
        src={logoPanda}
        alt="Promptfoo Logo"
        className="logo-icon w-[25px] h-auto transition-all duration-1000 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)]"
      />
      <span className="logo-text ml-2 hidden font-['Inter',sans-serif] text-base font-semibold text-foreground tracking-[0.02em] transition-all duration-300 sm:inline">
        promptfoo
      </span>
    </Link>
  );
}

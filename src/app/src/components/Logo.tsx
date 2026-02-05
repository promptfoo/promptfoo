import logoPanda from '@app/assets/logo.svg';
import { Link } from 'react-router-dom';

import './Logo.css';

export default function Logo() {
  return (
    <Link to="/" className="inline-flex items-center px-2 py-1 no-underline perspective-[2000px]">
      <img
        src={logoPanda}
        alt="Promptfoo Logo"
        className="logo-icon w-[25px] h-auto transition-all duration-1000 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)]"
      />
      <span className="logo-text font-['Inter',sans-serif] font-semibold text-base text-foreground tracking-[0.02em] ml-2 transition-all duration-300">
        promptfoo
      </span>
    </Link>
  );
}

import logoPanda from '@app/assets/logo.svg';
import { Link } from 'react-router';

export default function Logo() {
  return (
    <Link
      to="/"
      className="hidden shrink-0 items-center px-0 py-1 no-underline min-[360px]:inline-flex sm:px-2"
    >
      <img src={logoPanda} alt="Promptfoo Logo" className="w-[25px] h-auto" />
      <span className="ml-2 hidden text-base font-semibold text-foreground tracking-tight lg:inline">
        promptfoo
      </span>
    </Link>
  );
}

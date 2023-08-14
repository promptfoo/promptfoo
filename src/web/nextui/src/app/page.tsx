import { redirect } from 'next/navigation';

import './Home.css';

export default function Page() {
  redirect('/eval');
}

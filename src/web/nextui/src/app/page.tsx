import './Home.css';
import { IS_RUNNING_LOCALLY } from '@/constants';
import { redirect } from 'next/navigation';

export default function Page() {
  if (IS_RUNNING_LOCALLY) {
    redirect('/eval');
  } else {
    redirect('/setup');
  }
}

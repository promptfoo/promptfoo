import { IS_RUNNING_LOCALLY } from '@app/constants';
import { redirect } from 'next/navigation';
import './Home.css';

export default function Page() {
  if (IS_RUNNING_LOCALLY) {
    redirect('/eval');
  } else {
    redirect('/setup');
  }
}

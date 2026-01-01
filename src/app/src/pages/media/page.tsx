import { usePageMeta } from '@app/hooks/usePageMeta';
import ErrorBoundary from '../../components/ErrorBoundary';
import Media from './Media';

export default function MediaPage() {
  usePageMeta({ title: 'Media Library', description: 'Browse generated media from evaluations' });

  return (
    <ErrorBoundary name="Media Library">
      <Media />
    </ErrorBoundary>
  );
}

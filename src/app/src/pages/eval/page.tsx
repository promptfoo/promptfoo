import { useParams } from 'react-router-dom';
import Eval from '@app/pages/eval/components/Eval';
import { StoreProvider } from '@app/pages/eval/components/store';

export default function EvalPage() {
  const { evalId } = useParams();
  return (
    <StoreProvider>
      <Eval fetchId={evalId} />
    </StoreProvider>
  );
}

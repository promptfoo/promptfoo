import { useEffect } from 'react';
import Prompts from './Prompts';

export default function PromptsPage() {
  useEffect(() => {
    document.title = 'Prompts | promptfoo';
  }, []);

  return (
    <div>
      <Prompts />
    </div>
  );
}

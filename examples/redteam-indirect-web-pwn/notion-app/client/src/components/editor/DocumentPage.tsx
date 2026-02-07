import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, MoreHorizontal, Star, Clock } from 'lucide-react';
import { useDocumentStore } from '../../store/documentStore';
import DocumentEditor from './DocumentEditor';
import AIChatPanel from '../ai/AIChatPanel';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { currentDocument, fetchDocument, isLoading, lastSaved } =
    useDocumentStore();
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    if (id) {
      fetchDocument(id);
    }
  }, [id, fetchDocument]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-notion-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!currentDocument) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Document not found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-notion-border">
        <div className="flex items-center gap-2 text-sm text-notion-text-secondary">
          <span className="text-base">{currentDocument.icon}</span>
          <span className="font-medium text-notion-text">
            {currentDocument.title}
          </span>
          {lastSaved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Clock className="w-3 h-3" />
              Saved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            data-testid="ai-assistant-button"
            onClick={() => setShowAI(!showAI)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showAI
                ? 'bg-notion-accent text-white'
                : 'text-notion-text-secondary hover:bg-notion-hover'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>AI Assistant</span>
          </button>
          <button className="p-1.5 hover:bg-notion-hover rounded text-notion-text-secondary">
            <Star className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-notion-hover rounded text-notion-text-secondary">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div
          className={`flex-1 overflow-y-auto ${showAI ? 'w-2/3' : 'w-full'}`}
        >
          <DocumentEditor />
        </div>

        {showAI && (
          <div className="w-1/3 border-l border-notion-border overflow-hidden">
            <AIChatPanel documentId={currentDocument.id} />
          </div>
        )}
      </div>
    </div>
  );
}

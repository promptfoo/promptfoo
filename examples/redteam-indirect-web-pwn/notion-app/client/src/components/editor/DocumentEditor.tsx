import { useDocumentStore } from '../../store/documentStore';
import MarkdownRenderer from './MarkdownRenderer';
import AutoSave from './AutoSave';

export default function DocumentEditor() {
  const { currentDocument, updateContent } = useDocumentStore();

  if (!currentDocument) return null;

  return (
    <div className="max-w-4xl mx-auto px-16 py-12">
      <AutoSave />

      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-5xl">{currentDocument.icon}</span>
        </div>
        <h1 className="text-4xl font-bold text-notion-text">
          {currentDocument.title}
        </h1>
      </div>

      <div className="min-h-[60vh]">
        <div className="markdown-content mb-8">
          <MarkdownRenderer content={currentDocument.content} />
        </div>

        <div className="border-t border-notion-border pt-8 mt-8">
          <div className="text-xs text-notion-text-secondary mb-2 font-medium uppercase tracking-wide">
            Edit Mode
          </div>
          <textarea
            value={currentDocument.content}
            onChange={(e) => updateContent(e.target.value)}
            className="w-full min-h-[300px] p-4 border border-notion-border rounded-lg
                       font-mono text-sm text-notion-text bg-gray-50
                       focus:outline-none focus:ring-2 focus:ring-notion-accent focus:border-transparent
                       resize-y"
            placeholder="Write your content in Markdown..."
          />
        </div>
      </div>
    </div>
  );
}

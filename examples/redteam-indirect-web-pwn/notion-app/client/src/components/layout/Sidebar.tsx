import { Link, useParams } from 'react-router-dom';
import { FileText, Plus, Search, Settings, ChevronDown } from 'lucide-react';
import { useDocumentStore } from '../../store/documentStore';

export default function Sidebar() {
  const { documents } = useDocumentStore();
  const { id: currentDocId } = useParams();

  const rootDocs = documents.filter((d) => !d.parentId);
  const childDocs = documents.filter((d) => d.parentId);
  const getChildren = (parentId: string) =>
    childDocs.filter((d) => d.parentId === parentId);

  return (
    <aside className="w-60 h-screen bg-notion-sidebar border-r border-notion-border flex flex-col">
      <div className="p-3 border-b border-notion-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-notion-hover cursor-pointer">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-semibold">
            A
          </div>
          <span className="font-medium text-sm text-notion-text flex-1">
            Acme Corp
          </span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </div>

      <div className="p-2">
        <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded">
          <Search className="w-4 h-4" />
          <span>Search</span>
        </button>
      </div>

      <div className="px-2 pb-2 border-b border-notion-border">
        <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-notion-text-secondary hover:bg-notion-hover rounded">
          <Plus className="w-4 h-4" />
          <span>New page</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <span className="text-xs font-medium text-notion-text-secondary uppercase tracking-wide">
            Private
          </span>
        </div>

        <nav className="px-2">
          {rootDocs.map((doc) => (
            <div key={doc.id}>
              <Link
                data-testid={`doc-link-${doc.id}`}
                to={`/doc/${doc.id}`}
                className={`flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors ${
                  currentDocId === doc.id
                    ? 'bg-notion-hover text-notion-text font-medium'
                    : 'text-notion-text-secondary hover:bg-notion-hover'
                }`}
              >
                <span className="text-base">{doc.icon}</span>
                <span className="truncate flex-1">{doc.title}</span>
              </Link>

              {getChildren(doc.id).map((child) => (
                <Link
                  data-testid={`doc-link-${child.id}`}
                  key={child.id}
                  to={`/doc/${child.id}`}
                  className={`flex items-center gap-2 px-2 py-1 ml-4 rounded text-sm transition-colors ${
                    currentDocId === child.id
                      ? 'bg-notion-hover text-notion-text font-medium'
                      : 'text-notion-text-secondary hover:bg-notion-hover'
                  }`}
                >
                  <span className="text-base">{child.icon}</span>
                  <span className="truncate flex-1">{child.title}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="p-3 border-t border-notion-border text-xs text-notion-text-secondary">
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          <span>{documents.length} pages</span>
        </div>
      </div>
    </aside>
  );
}

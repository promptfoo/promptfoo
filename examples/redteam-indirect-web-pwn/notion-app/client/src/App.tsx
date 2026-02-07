import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useDocumentStore } from './store/documentStore';
import Sidebar from './components/layout/Sidebar';
import DocumentPage from './components/editor/DocumentPage';

function App() {
  const { fetchDocuments, documents } = useDocumentStore();

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route
            path="/"
            element={
              documents.length > 0 ? (
                <Navigate to={`/doc/${documents[0].id}`} replace />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  Select a document from the sidebar
                </div>
              )
            }
          />
          <Route path="/doc/:id" element={<DocumentPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

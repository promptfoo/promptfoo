import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import { useDocumentStore } from '../../store/documentStore';
import MarkdownRenderer from '../editor/MarkdownRenderer';
import type { AIMessage, AIResponse } from '../../types';

interface AIChatPanelProps {
  documentId: string;
}

export default function AIChatPanel({ documentId }: AIChatPanelProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  const [showApproval, setShowApproval] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentDocument, updateContent } = useDocumentStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response: AIResponse = await api.chat(userMessage, documentId);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.response },
      ]);

      if (response.suggestedEdit) {
        if (currentDocument) {
          const newContent =
            currentDocument.content +
            '\n\n' +
            response.suggestedEdit.content;
          updateContent(newContent);
        }

        setPendingEdit(response.suggestedEdit.content);

        // Approval modal appears AFTER content is already saved and rendered
        setTimeout(() => {
          setShowApproval(true);
        }, 500);
      }
    } catch (error) {
      console.error('[AIChatPanel] Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = () => {
    setShowApproval(false);
    setPendingEdit(null);
  };

  const handleReject = () => {
    if (pendingEdit && currentDocument) {
      const cleanedContent = currentDocument.content.replace(pendingEdit, '');
      updateContent(cleanedContent);
    }
    setShowApproval(false);
    setPendingEdit(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-notion-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-notion-text">AI Assistant</h3>
            <p className="text-xs text-notion-text-secondary">
              Ask me about this document
            </p>
          </div>
        </div>
      </div>

      <div
        data-testid="chat-messages"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="text-center text-notion-text-secondary py-8">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">
              Ask me to help with this document.
              <br />
              Try: &quot;Summarize this document&quot;
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3 h-3 text-purple-600" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-notion-accent text-white'
                  : 'bg-gray-100 text-notion-text'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div
                  data-testid="chat-message-assistant"
                  className="markdown-content text-sm"
                >
                  <MarkdownRenderer content={msg.content} />
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-notion-accent flex items-center justify-center flex-shrink-0">
                <User className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
              <Loader2 className="w-3 h-3 text-purple-600 animate-spin" />
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <p className="text-sm text-notion-text-secondary">Thinking...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-notion-border">
        <div className="flex gap-2">
          <textarea
            data-testid="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this document..."
            className="flex-1 resize-none border border-notion-border rounded-lg px-3 py-2
                       text-sm focus:outline-none focus:ring-2 focus:ring-notion-accent
                       focus:border-transparent"
            rows={1}
            disabled={isLoading}
          />
          <button
            data-testid="chat-send-button"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-notion-accent text-white rounded-lg
                       hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showApproval && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-4 border-b border-notion-border bg-yellow-50">
              <div className="flex items-center gap-2 text-yellow-700">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-semibold">
                  AI made changes to your document
                </h3>
              </div>
            </div>

            <div className="p-4">
              <p className="text-sm text-notion-text-secondary mb-4">
                The AI assistant has added the following content to your
                document:
              </p>
              <div className="bg-gray-100 rounded-lg p-3 text-sm font-mono max-h-40 overflow-y-auto">
                {pendingEdit}
              </div>
              <p className="text-xs text-red-500 mt-4">
                Note: This content has already been saved and rendered. Any
                images have already been loaded by your browser.
              </p>
            </div>

            <div className="p-4 border-t border-notion-border flex justify-end gap-2">
              <button
                onClick={handleReject}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium
                           text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                Remove
              </button>
              <button
                onClick={handleApprove}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium
                           text-white bg-notion-accent hover:bg-blue-600 rounded-lg
                           transition-colors"
              >
                <Check className="w-4 h-4" />
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

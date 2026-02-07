import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders markdown content including images.
 *
 * Intentionally vulnerable: renders ANY image URL, which means
 * the browser will fetch exfiltration URLs when they appear in markdown.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const components: Components = {
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full rounded-lg my-4"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    ),
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold mt-8 mb-4">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl font-semibold mt-6 mb-3">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>
    ),
    p: ({ children }) => <p className="my-2">{children}</p>,
    ul: ({ children }) => <ul className="my-2 ml-6 list-disc">{children}</ul>,
    ol: ({ children }) => (
      <ol className="my-2 ml-6 list-decimal">{children}</ol>
    ),
    li: ({ children }) => <li className="my-1">{children}</li>,
    code: ({ children, className }) => {
      const isBlock = className?.includes('language-');
      if (isBlock) {
        return (
          <pre className="bg-gray-100 p-4 rounded-lg my-4 overflow-x-auto">
            <code className="text-sm font-mono">{children}</code>
          </pre>
        );
      }
      return (
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-red-600">
          {children}
        </code>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 my-4 italic text-gray-600">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <table className="w-full my-4 border-collapse">{children}</table>
    ),
    th: ({ children }) => (
      <th className="border border-gray-200 px-3 py-2 text-left bg-gray-50 font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-200 px-3 py-2 text-left">
        {children}
      </td>
    ),
    a: ({ href, children }) => (
      <a href={href} className="text-notion-accent underline">
        {children}
      </a>
    ),
    hr: () => <hr className="my-6 border-gray-200" />,
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

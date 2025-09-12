import React from 'react';

// Helper type to access children from React element props
interface ReactElementWithChildren extends React.ReactElement {
  props: { children?: React.ReactNode } & Record<string, any>;
}

function isReactElementWithChildren(node: React.ReactNode): node is ReactElementWithChildren {
  return React.isValidElement(node) && 'children' in node.props;
}

// Helper function to check if a string contains a markdown image with base64 data
function containsMarkdownBase64Image(text: string): boolean {
  // Updated regex to handle nested brackets in alt text properly
  // Uses a more flexible approach that looks for the markdown pattern with base64 data
  return /!\[.*?\]\(data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+\)/.test(text);
}

// Helper function to extract text content from React nodes for base64 detection
function extractTextContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return node.toString();
  }
  if (Array.isArray(node)) {
    return node.map((child) => extractTextContent(child)).join('');
  }
  if (isReactElementWithChildren(node)) {
    return React.Children.toArray(node.props.children)
      .map((child) => extractTextContent(child))
      .join('');
  }
  return '';
}

function textLength(node: React.ReactNode): number {
  if (typeof node === 'string' || typeof node === 'number') {
    return node.toString().length;
  }
  if (Array.isArray(node)) {
    return node.reduce((acc, child) => acc + textLength(child), 0);
  }
  if (isReactElementWithChildren(node)) {
    return React.Children.toArray(node.props.children).reduce(
      (acc: number, child) => acc + textLength(child),
      0,
    );
  }
  return 0;
}

export interface TruncatedTextProps {
  text: string | number | React.ReactNode;
  maxLength: number;
}

function TruncatedText({ text: rawText, maxLength }: TruncatedTextProps) {
  // Normalize without destroying arrays/element structure
  const text: React.ReactNode =
    typeof rawText === 'string' ||
    typeof rawText === 'number' ||
    Array.isArray(rawText) ||
    React.isValidElement(rawText)
      ? rawText
      : JSON.stringify(rawText);

  const contentLen = textLength(text);

  // Check if the content contains a markdown base64 image
  // If so, we should never truncate regardless of length
  const containsBase64Image = containsMarkdownBase64Image(extractTextContent(text));

  const isOverLength = maxLength > 0 && contentLen > maxLength;

  // Initialize truncation state based on whether text actually exceeds maxLength
  // But don't truncate if it contains a base64 image
  const [isTruncated, setIsTruncated] = React.useState(() => isOverLength && !containsBase64Image);

  // Only reset when textual content length changes (not when maxLength changes)
  const prevContentLenRef = React.useRef(contentLen);
  React.useEffect(() => {
    if (prevContentLenRef.current !== contentLen) {
      setIsTruncated(maxLength > 0 && contentLen > maxLength && !containsBase64Image);
      prevContentLenRef.current = contentLen;
    }
  }, [contentLen, maxLength, containsBase64Image]);

  const toggleTruncate = () => {
    setIsTruncated((v) => !v);
  };

  const truncateText = (node: React.ReactNode, length: number = 0): React.ReactNode => {
    if (typeof node === 'string' || typeof node === 'number') {
      const nodeAsString = node.toString();

      // Don't truncate if this string contains base64 image data
      if (containsMarkdownBase64Image(nodeAsString)) {
        return nodeAsString;
      }

      return nodeAsString.slice(0, maxLength - length);
    }
    if (Array.isArray(node)) {
      const nodes: React.ReactNode[] = [];
      let currentLength = length;
      for (const child of node) {
        const childLength = textLength(child);
        if (currentLength + childLength > maxLength) {
          nodes.push(truncateText(child, currentLength));
          break;
        } else {
          nodes.push(child);
          currentLength += childLength;
        }
      }
      return nodes;
    }
    if (isReactElementWithChildren(node)) {
      const childLength = textLength(node.props.children);
      if (childLength > maxLength - length) {
        return React.cloneElement(node, {
          ...node.props,
          children: truncateText(node.props.children, length),
        });
      }
    }
    return node;
  };

  const truncatedText = isTruncated ? truncateText(text) : text;
  return (
    <div style={{ position: 'relative' }}>
      <div
        // TODO: Element IDs should be unique; these aren't.
        id="eval-output-cell-text"
        style={{
          cursor: isOverLength ? 'pointer' : 'normal',
          position: 'relative',
          marginBottom: '8px',
        }}
        onClick={isOverLength ? toggleTruncate : undefined}
      >
        {truncatedText}
        {isTruncated && isOverLength && !containsBase64Image && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: '4px',
              color: '#3b82f6',
              fontWeight: 'bold',
              fontSize: '0.85em',
              padding: '0 4px',
              borderRadius: '4px',
              background: 'rgba(59, 130, 246, 0.1)',
              letterSpacing: '0.1rem',
            }}
          >
            <span>...</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginLeft: '4px' }}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        )}
        {!isTruncated && isOverLength && !containsBase64Image && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: '4px',
              color: '#3b82f6',
              fontWeight: 'bold',
              fontSize: '0.85em',
              padding: '0 4px',
              borderRadius: '4px',
              background: 'rgba(59, 130, 246, 0.1)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleTruncate();
            }}
          >
            <span>Show less</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginLeft: '4px' }}
            >
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
const MemoizedTruncatedText = React.memo(TruncatedText);

export default MemoizedTruncatedText;

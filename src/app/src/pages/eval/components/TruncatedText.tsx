import React from 'react';

// Helper type to access children from React element props
interface ReactElementWithChildren extends React.ReactElement {
  props: { children?: React.ReactNode } & Record<string, any>;
}

function isReactElementWithChildren(node: React.ReactNode): node is ReactElementWithChildren {
  if (!React.isValidElement(node)) {
    return false;
  }
  if (!node.props || typeof node.props !== 'object') {
    return false;
  }
  return 'children' in node.props;
}

// Helper function to check if a string contains a markdown image with base64 data
function containsMarkdownBase64Image(text: string): boolean {
  // Updated regex to handle nested brackets in alt text properly
  // Uses a more flexible approach that looks for the markdown pattern with base64 data
  return /!\[.*?\]\(data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+\)/.test(text);
}

// Helper function to extract text content from React nodes for base64 detection.
// Note: This utility is needed because TruncatedText receives arbitrary React nodes
// and needs to check if they contain base64 images before truncation decisions.
// An alternative would be to parse/detect images upstream before passing to this component.
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

  const contentLen = React.useMemo(() => textLength(text), [text]);

  // Check if the content contains a markdown base64 image
  // If so, we should never truncate regardless of length
  const containsBase64Image = React.useMemo(
    () => containsMarkdownBase64Image(extractTextContent(text)),
    [text],
  );

  const isOverLength = React.useMemo(
    () => maxLength > 0 && contentLen > maxLength,
    [contentLen, maxLength],
  );

  // Initialize truncation state based on whether text actually exceeds maxLength
  // But don't truncate if it contains a base64 image
  const [isTruncated, setIsTruncated] = React.useState(() => isOverLength && !containsBase64Image);

  // Reset truncation state when content or length threshold changes
  React.useEffect(() => {
    setIsTruncated(isOverLength && !containsBase64Image);
  }, [isOverLength, containsBase64Image]);

  const toggleTruncate = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsTruncated((v) => !v);
  };

  const truncateText = (node: React.ReactNode, length: number = 0): React.ReactNode => {
    if (typeof node === 'string' || typeof node === 'number') {
      const nodeAsString = node.toString();

      // Don't truncate if this string contains base64 image data
      if (containsMarkdownBase64Image(nodeAsString)) {
        return nodeAsString;
      }

      // Guard against negative remaining length
      const remaining = maxLength - length;
      if (remaining <= 0) {
        return '';
      }
      return nodeAsString.slice(0, remaining);
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
          position: 'relative',
          marginBottom: '8px',
        }}
        // Force re-render when isOverLength changes by adding a data attribute
        data-over-length={isOverLength}
      >
        {truncatedText}

        {isOverLength && !containsBase64Image && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: '4px',
              color: '#3b82f6',
              fontWeight: 'bold',
              fontSize: '0.85em',
              padding: '1px 4px',
              borderRadius: '4px',
              background: 'rgba(59, 130, 246, 0.1)',
              cursor: 'pointer',
            }}
            onClick={toggleTruncate}
            className="truncation-toggler"
          >
            {isTruncated ? (
              <span style={{ letterSpacing: '0.1rem' }}>...</span>
            ) : (
              <span>Show less</span>
            )}
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
              {isTruncated ? (
                <polyline points="6 9 12 15 18 9"></polyline>
              ) : (
                <polyline points="18 15 12 9 6 15"></polyline>
              )}
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
const MemoizedTruncatedText = React.memo(TruncatedText);

export default MemoizedTruncatedText;

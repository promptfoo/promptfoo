import React from 'react';

// Helper type to access children from React element props
interface ReactElementWithChildren extends React.ReactElement {
  props: { children?: React.ReactNode } & Record<string, unknown>;
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

  // Only compute text length when truncation is enabled (maxLength > 0)
  // textLength() is O(n) recursive traversal, so skip it when not needed
  const isOverLength = maxLength > 0 && textLength(text) > maxLength;

  // Initialize truncation state based on whether text actually exceeds maxLength
  const [isTruncated, setIsTruncated] = React.useState(() => isOverLength);

  // Reset truncation state when content or length threshold changes
  React.useEffect(() => {
    setIsTruncated(isOverLength);
  }, [isOverLength]);

  const toggleTruncate = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsTruncated((v) => !v);
  };

  const truncateText = (node: React.ReactNode, length: number = 0): React.ReactNode => {
    if (typeof node === 'string' || typeof node === 'number') {
      const nodeAsString = node.toString();
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
          position: 'relative',
          marginBottom: '8px',
        }}
        // Force re-render when isOverLength changes by adding a data attribute
        data-over-length={isOverLength}
      >
        {truncatedText}

        {isOverLength && (
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

// React.memo prevents re-renders when props haven't changed.
// This is valuable because TruncatedText renders inside EvalOutputCell in tables,
// and textLength() is O(n) recursive traversal that we want to skip when possible.
export default React.memo(TruncatedText);

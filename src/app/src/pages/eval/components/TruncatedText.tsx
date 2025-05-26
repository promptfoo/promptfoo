import React from 'react';

function textLength(node: React.ReactNode): number {
  if (typeof node === 'string' || typeof node === 'number') {
    return node.toString().length;
  }
  if (Array.isArray(node)) {
    return node.reduce((acc, child) => acc + textLength(child), 0);
  }
  if (React.isValidElement(node) && node.props.children) {
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
  const [isTruncated, setIsTruncated] = React.useState<boolean>(true);
  const toggleTruncate = () => {
    setIsTruncated(!isTruncated);
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
    if (React.isValidElement(node) && node.props.children) {
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

  let text;
  if (React.isValidElement(rawText) || typeof rawText === 'string') {
    text = rawText;
  } else {
    text = JSON.stringify(rawText);
  }
  const truncatedText = isTruncated ? truncateText(text) : text;

  const isOverLength = textLength(text) > maxLength;
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          cursor: isOverLength ? 'pointer' : 'normal',
          position: 'relative',
        }}
        onClick={isOverLength ? toggleTruncate : undefined}
      >
        {truncatedText}
        {isTruncated && isOverLength && (
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
        {!isTruncated && isOverLength && (
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

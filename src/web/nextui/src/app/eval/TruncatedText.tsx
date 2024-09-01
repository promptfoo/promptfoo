import * as React from 'react';

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
    <div
      style={{ cursor: isOverLength ? 'pointer' : 'normal' }}
      onMouseDown={(e) => {
        // TODO(ian): This is madness. But the purpose is to make it easier to copy text while preserving the toggle capability.
        // Maybe instead, let's make cells fixed height and remove this visibility toggle.
        const startX = e.clientX;
        const startY = e.clientY;

        const handleMouseUp = (e: MouseEvent) => {
          const endX = e.clientX;
          const endY = e.clientY;

          // If the mouse hasn't moved (or moved very little), consider it a click
          if (Math.abs(endX - startX) < 5 && Math.abs(endY - startY) < 5) {
            toggleTruncate();
          }

          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mouseup', handleMouseUp);
      }}
    >
      {truncatedText}
      {isTruncated && textLength(text) > maxLength && <span>...</span>}
    </div>
  );
}
const MemoizedTruncatedText = React.memo(TruncatedText);

export default MemoizedTruncatedText;

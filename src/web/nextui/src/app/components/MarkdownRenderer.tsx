import React from 'react';
import ReactMarkdown from 'react-markdown';
import CustomImage from './CustomImage';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <ReactMarkdown
      components={{
        img: ({ node, ...props }) => (
          <CustomImage src={props.src || ''} alt={props.alt || ''} {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownRenderer;

import React from 'react';
import { DocProvider } from '@docusaurus/plugin-content-docs/client';
import { HtmlClassNameProvider } from '@docusaurus/theme-common';
import DocItemLayout from '@theme/DocItem/Layout';
import DocItemMetadata from '@theme/DocItem/Metadata';

export default function DocItem(props) {
  const docHtmlClassName = `docs-doc-id-${props.content.metadata.id}`;
  const MDXComponent = props.content;
  return (
    <DocProvider content={props.content}>
      <HtmlClassNameProvider className={docHtmlClassName}>
        <DocItemMetadata />
        <DocItemLayout>
          <div style={{ position: 'relative' }}>
            <MDXComponent />
          </div>
        </DocItemLayout>
      </HtmlClassNameProvider>
    </DocProvider>
  );
}

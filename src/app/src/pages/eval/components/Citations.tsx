import React, { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Card, CardContent } from '@app/components/ui/card';
import { cn } from '@app/lib/utils';
import { Check, ClipboardCopy, File, Globe, Link } from 'lucide-react';
import { ellipsize } from '../../../../../util/text';

// Citation type definitions to handle different provider formats
interface BedrockReference {
  location?: {
    s3Location?: { uri?: string };
    type?: string;
  };
  content?: { text?: string };
}

interface BedrockCitation {
  retrievedReferences?: BedrockReference[];
}

interface GenericCitation {
  source?: string | { title?: string; url?: string };
  quote?: string;
  text?: string;
  url?: string;
  uri?: string;
  location?: string;
  path?: string;
  content?: string;
  excerpt?: string;
  snippet?: string;
}

export type Citation = string | BedrockCitation | GenericCitation;

interface ExtractedCitation {
  source: string;
  content: string;
}

const isValidUrl = (str: string): boolean => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

const getSourceIcon = (source: string) => {
  if (isValidUrl(source)) {
    return <Globe className="size-4" />;
  }
  if (source.includes('file:') || source.includes('s3:')) {
    return <File className="size-4" />;
  }
  return <Link className="size-4" />;
};

const getSourceType = (source: string): string => {
  if (isValidUrl(source)) {
    try {
      const url = new URL(source);
      return url.hostname.replace('www.', '');
    } catch {
      return 'WEB';
    }
  }
  if (source.includes('s3:')) {
    return 'S3';
  }
  if (source.includes('file:')) {
    return 'FILE';
  }
  if (source.includes('Source type:')) {
    const type = source.split('Source type:')[1].trim();
    return type.toUpperCase();
  }
  return 'DOCUMENT';
};

const extractCitationInfo = (citation: Citation): ExtractedCitation => {
  // Handle string citations
  if (typeof citation === 'string') {
    return {
      source: 'Unknown source',
      content: citation,
    };
  }

  // Handle Bedrock format with retrievedReferences
  if ('retrievedReferences' in citation && citation.retrievedReferences?.length) {
    const reference = citation.retrievedReferences[0];
    return {
      source:
        reference.location?.s3Location?.uri ||
        (reference.location?.type ? `Source type: ${reference.location.type}` : 'Unknown source'),
      content: reference.content?.text || 'No content available',
    };
  }

  // Handle generic citations with source as string
  if ('source' in citation && citation.source && typeof citation.source === 'string') {
    return {
      source: citation.source,
      content:
        ('content' in citation && citation.content) ||
        ('quote' in citation && citation.quote) ||
        ('text' in citation && citation.text) ||
        JSON.stringify(citation, null, 2),
    };
  }

  // Handle generic citations with source object
  if ('source' in citation && citation.source && typeof citation.source === 'object') {
    return {
      source: citation.source.url || citation.source.title || 'Unknown source',
      content: citation.quote || citation.text || JSON.stringify(citation, null, 2),
    };
  }

  // Handle generic citations with direct properties
  const source =
    ('url' in citation && citation.url) ||
    ('uri' in citation && citation.uri) ||
    ('location' in citation && citation.location) ||
    ('path' in citation && citation.path) ||
    'Unknown source';

  const content =
    ('content' in citation && citation.content) ||
    ('text' in citation && citation.text) ||
    ('quote' in citation && citation.quote) ||
    ('excerpt' in citation && citation.excerpt) ||
    ('snippet' in citation && citation.snippet) ||
    JSON.stringify(citation, null, 2);

  return { source: String(source), content: String(content) };
};

const processCitations = (citations: Citation[]): ExtractedCitation[] => {
  const results: ExtractedCitation[] = [];

  if (Array.isArray(citations)) {
    for (const citation of citations) {
      if (
        typeof citation === 'object' &&
        'retrievedReferences' in citation &&
        Array.isArray(citation.retrievedReferences)
      ) {
        for (const reference of citation.retrievedReferences) {
          results.push(extractCitationInfo({ retrievedReferences: [reference] }));
        }
      } else {
        results.push(extractCitationInfo(citation));
      }
    }
  }

  return results;
};

/**
 * Component for displaying citations from various sources
 * Handles different citation formats from different providers
 */
export default function Citations({
  citations,
}: {
  citations: Citation | Citation[] | null | undefined;
}) {
  const [copiedCitations, setCopiedCitations] = useState<{ [key: string]: boolean }>({});

  if (!citations || (Array.isArray(citations) && citations.length === 0)) {
    return null;
  }

  const processedCitations = processCitations(Array.isArray(citations) ? citations : [citations]);

  if (processedCitations.length === 0) {
    return null;
  }

  const copyCitationToClipboard = async (key: string, text: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    await navigator.clipboard.writeText(text);
    setCopiedCitations((prev) => ({ ...prev, [key]: true }));

    setTimeout(() => {
      setCopiedCitations((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  return (
    <div className="my-6">
      <h3 className="text-base font-medium mb-4 flex items-center">
        Citations
        <span className="ml-2 text-sm text-muted-foreground">({processedCitations.length})</span>
      </h3>

      {processedCitations.map((citation, i) => {
        const key = `citation-${i}`;
        const sourceLocation = citation.source;
        const content = citation.content;
        const sourceType = getSourceType(sourceLocation);

        return (
          <Card key={key} className="mb-4">
            <CardContent className="relative p-4">
              <div className="flex items-center mb-3 pb-2 border-b border-border">
                <Badge variant="secondary" className="mr-4 gap-1.5 font-medium">
                  {getSourceIcon(sourceLocation)}
                  {sourceType}
                </Badge>

                {isValidUrl(sourceLocation) ? (
                  <a
                    href={sourceLocation}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-primary hover:underline"
                  >
                    {ellipsize(sourceLocation, 100)}
                  </a>
                ) : (
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground">
                    {sourceLocation}
                  </span>
                )}

                <button
                  type="button"
                  onClick={(e) => copyCitationToClipboard(key, content, e)}
                  className={cn(
                    'ml-auto p-1 rounded hover:bg-muted transition-colors',
                    copiedCitations[key] ? 'text-emerald-600' : 'text-muted-foreground',
                  )}
                  aria-label={`Copy citation content ${i + 1}`}
                >
                  {copiedCitations[key] ? (
                    <Check className="size-4" data-testid="CheckIcon" />
                  ) : (
                    <ClipboardCopy className="size-4" />
                  )}
                </button>
              </div>

              <p className="p-3 rounded bg-muted/30 whitespace-pre-wrap text-sm leading-relaxed font-sans">
                {content}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

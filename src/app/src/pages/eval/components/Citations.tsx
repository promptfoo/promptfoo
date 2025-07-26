import React, { useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DescriptionIcon from '@mui/icons-material/Description';
import LanguageIcon from '@mui/icons-material/Language';
import LinkIcon from '@mui/icons-material/Link';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { ellipsize } from '../../../../../util/text';

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
    return <LanguageIcon fontSize="small" />;
  }
  if (source.includes('file:') || source.includes('s3:')) {
    return <DescriptionIcon fontSize="small" />;
  }
  return <LinkIcon fontSize="small" />;
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

const extractCitationInfo = (citation: any): { source: string; content: string } => {
  if (citation.retrievedReferences?.length > 0) {
    const reference = citation.retrievedReferences[0];
    return {
      source:
        reference.location?.s3Location?.uri ||
        (reference.location?.type ? `Source type: ${reference.location.type}` : 'Unknown source'),
      content: reference.content?.text || 'No content available',
    };
  }

  if (citation.source?.title || citation.source?.url) {
    return {
      source: citation.source.url || citation.source.title || 'Unknown source',
      content: citation.quote || citation.text || JSON.stringify(citation, null, 2),
    };
  }

  if (typeof citation === 'object') {
    const source =
      citation.url ||
      citation.source ||
      citation.uri ||
      citation.location ||
      citation.path ||
      'Unknown source';

    const content =
      citation.content ||
      citation.text ||
      citation.quote ||
      citation.excerpt ||
      citation.snippet ||
      JSON.stringify(citation, null, 2);

    return { source, content };
  }

  return {
    source: 'Unknown source',
    content: typeof citation === 'string' ? citation : JSON.stringify(citation, null, 2),
  };
};

const processCitations = (citations: any[]): Array<{ source: string; content: string }> => {
  const results: Array<{ source: string; content: string }> = [];

  if (Array.isArray(citations)) {
    for (const citation of citations) {
      if (citation.retrievedReferences && Array.isArray(citation.retrievedReferences)) {
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
export default function Citations({ citations }: { citations: any }) {
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
    <Box mt={3} mb={3}>
      <Typography
        variant="subtitle1"
        gutterBottom
        sx={{ display: 'flex', alignItems: 'center', mb: 2 }}
      >
        Citations
        <Typography component="span" variant="body2" sx={{ ml: 1, color: 'text.secondary' }}>
          ({processedCitations.length})
        </Typography>
      </Typography>

      {processedCitations.map((citation, i) => {
        const key = `citation-${i}`;
        const sourceLocation = citation.source;
        const content = citation.content;
        const sourceType = getSourceType(sourceLocation);

        return (
          <Card
            key={key}
            variant="outlined"
            sx={{
              mb: 2,
              border: '1px solid',
              borderColor: alpha('#000', 0.12),
            }}
          >
            <CardContent sx={{ position: 'relative', p: 2, pb: '16px !important' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  mb: 1.5,
                  pb: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Chip
                  icon={getSourceIcon(sourceLocation)}
                  label={sourceType}
                  size="small"
                  sx={{
                    mr: 2,
                    bgcolor: alpha('#000', 0.06),
                    fontWeight: 500,
                  }}
                />

                {isValidUrl(sourceLocation) ? (
                  <Link
                    href={sourceLocation}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    variant="body2"
                    sx={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'primary.main',
                    }}
                  >
                    {ellipsize(sourceLocation, 100)}
                  </Link>
                ) : (
                  <Typography
                    variant="body2"
                    sx={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'text.secondary',
                    }}
                  >
                    {sourceLocation}
                  </Typography>
                )}

                <IconButton
                  size="small"
                  onClick={(e) => copyCitationToClipboard(key, content, e)}
                  sx={{
                    ml: 'auto',
                    color: copiedCitations[key] ? 'success.main' : 'action.active',
                  }}
                  aria-label={`Copy citation content ${i + 1}`}
                >
                  {copiedCitations[key] ? (
                    <CheckIcon fontSize="small" />
                  ) : (
                    <ContentCopyIcon fontSize="small" />
                  )}
                </IconButton>
              </Box>

              <Typography
                variant="body2"
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: alpha('#000', 0.02),
                  whiteSpace: 'pre-wrap',
                  fontFamily:
                    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                }}
              >
                {content}
              </Typography>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

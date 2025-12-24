import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

interface StackedFieldsProps {
  fields: Record<string, string | number | boolean | null | object>;
  title?: string;
}

/**
 * Renders a flat object as stacked labeled fields.
 * Useful for displaying multiple input variables or structured data.
 */
export function StackedFields({ fields, title }: StackedFieldsProps) {
  const theme = useTheme();
  const textColor = theme.palette.text.primary;
  const labelColor = alpha(textColor, 0.6);

  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return null;
  }

  return (
    <Box>
      {title && (
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 500 }}>
          {title}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {entries.map(([key, value]) => {
          const displayValue =
            value === null
              ? 'null'
              : value === ''
                ? '(empty)'
                : typeof value === 'object'
                  ? JSON.stringify(value, null, 2)
                  : String(value);

          const isEmptyOrNull = value === null || value === '';
          const isComplexValue = typeof value === 'object' && value !== null;

          return (
            <Box key={key}>
              <Typography
                component="div"
                sx={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: labelColor,
                  mb: 0.25,
                }}
              >
                {key}
              </Typography>
              <Typography
                component={isComplexValue ? 'pre' : 'div'}
                sx={{
                  fontSize: '14px',
                  lineHeight: 1.5,
                  color: textColor,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  whiteSpace: isComplexValue ? 'pre-wrap' : 'normal',
                  fontFamily: isComplexValue ? 'monospace' : 'inherit',
                  fontStyle: isEmptyOrNull ? 'italic' : 'normal',
                  opacity: isEmptyOrNull ? 0.5 : 1,
                  m: 0,
                }}
              >
                {displayValue}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

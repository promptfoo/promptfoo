import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

export default function ProviderResponse({ providerResponse }: { providerResponse: any }) {
  return (
    <>
      <Typography variant="subtitle2" gutterBottom>
        Headers:
      </Typography>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
          maxHeight: '200px',
          overflow: 'auto',
          mb: 2,
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Header</TableCell>
              <TableCell>Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(providerResponse?.metadata?.headers || {}).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell sx={{ maxWidth: '200px', wordBreak: 'break-word' }}>{key}</TableCell>
                <TableCell sx={{ maxWidth: '300px', wordBreak: 'break-word' }}>
                  {value as string}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Typography variant="subtitle2" gutterBottom>
        Raw Result:
      </Typography>

      <Paper
        elevation={0}
        sx={{
          p: 2,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
          maxHeight: '200px',
          overflow: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {typeof providerResponse?.raw === 'string'
            ? providerResponse?.raw
            : JSON.stringify(providerResponse?.raw, null, 2)}
        </pre>
      </Paper>
      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
        Parsed Result:
      </Typography>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
          maxHeight: '200px',
          overflow: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {typeof providerResponse?.output === 'string'
            ? providerResponse?.output
            : JSON.stringify(providerResponse?.output, null, 2)}
        </pre>
      </Paper>
      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
        Session ID:
      </Typography>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
          maxHeight: '200px',
          overflow: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {providerResponse?.sessionId}
        </pre>
      </Paper>
    </>
  );
}

import ConstructionIcon from '@mui/icons-material/Construction';
import DangerousIcon from '@mui/icons-material/Dangerous';
import FlagIcon from '@mui/icons-material/Flag';
import PersonIcon from '@mui/icons-material/Person';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
} from '@mui/material';
import { type TargetPurposeDiscoveryResult } from '@promptfoo/redteam/commands/discover';

// Type definitions for better type safety
interface Tool {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    type: string;
  }>;
}

const Row = ({ label, value }: { label: React.ReactNode; value: React.ReactNode }) => {
  return (
    <TableRow sx={{ backgroundColor: (theme) => theme.palette.background.paper }}>
      <TableCell
        variant="head"
        sx={{
          width: 200,
          backgroundColor: (theme) => theme.palette.action.hover,
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          color: 'inherit',
          fontWeight: 500,
          paddingLeft: 3,
        }}
      >
        {label}
      </TableCell>
      <TableCell sx={{ padding: 3 }}>{value}</TableCell>
    </TableRow>
  );
};

const formatToolsAsJSDocs = (tools: (Tool | null)[] | null | undefined): string => {
  if (!tools || !Array.isArray(tools)) {
    return '';
  }

  return tools
    .filter((tool): tool is Tool => tool !== null) // Filter out null tools
    .map((tool) => {
      const params = tool.arguments?.map((arg) => `${arg.name}: ${arg.type}`).join(', ') || '';

      // Build JSDoc comment
      let jsDoc = '/**\n';
      jsDoc += ` * ${tool.description}\n`;

      // Add parameter descriptions
      if (tool.arguments && tool.arguments.length > 0) {
        tool.arguments.forEach((arg) => {
          jsDoc += ` * @param {${arg.type}} ${arg.name} - ${arg.description}\n`;
        });
      }

      jsDoc += ' */\n';
      jsDoc += `${tool.name}(${params})`;

      return jsDoc;
    })
    .join('\n\n');
};

export default function DiscoveredInformation({
  result,
}: {
  result: TargetPurposeDiscoveryResult;
}) {
  // Count non-null tools safely
  const tools = result.tools?.filter((tool) => tool !== null) ?? [];
  const toolCount = tools.length;

  return (
    <Box
      sx={{
        boxShadow: 0,
        border: 0,
      }}
    >
      <Typography variant="h5">Agent Discovered Information</Typography>
      <Box>
        <TableContainer
          component={Paper}
          sx={{
            mt: 2,
            mb: 2,
            boxShadow: 0,
            backgroundColor: (theme) => theme.palette.background.default,
            borderRadius: 2,
          }}
          elevation={0}
        >
          <Table size="small" aria-label="discovered information table">
            <TableBody>
              {result.purpose && (
                <Row
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <FlagIcon sx={{ mr: 1, color: 'info.main' }} fontSize="small" />
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        Purpose
                      </Box>
                    </Box>
                  }
                  value={result.purpose}
                />
              )}
              {result.limitations && (
                <Row
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <DangerousIcon sx={{ mr: 1, color: 'error.main' }} fontSize="small" />
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        Limitations
                      </Box>
                    </Box>
                  }
                  value={result.limitations}
                />
              )}
              {result.tools && toolCount > 0 && (
                <Row
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <ConstructionIcon sx={{ mr: 1, color: 'warning.main' }} fontSize="small" />
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        Tools ({toolCount})
                      </Box>
                    </Box>
                  }
                  value={
                    <Box component="pre" sx={{ margin: 0 }}>
                      <Box
                        component="code"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatToolsAsJSDocs(tools)}
                      </Box>
                    </Box>
                  }
                />
              )}
              {result.user && (
                <Row
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PersonIcon sx={{ mr: 1, color: 'secondary.main' }} fontSize="small" />
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        User
                      </Box>
                    </Box>
                  }
                  value={result.user}
                />
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}

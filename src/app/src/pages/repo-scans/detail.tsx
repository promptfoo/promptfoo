import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useParams } from 'react-router-dom';

import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface RepoScanRecord {
  id: string;
  createdAt: number;
  label?: string;
  rootPaths?: string[];
  result: {
    findings: Array<{
      filePath: string;
      detectorId: string;
      description: string;
      provider?: string;
      capability?: string;
      confidence: number;
      lineText: string;
      contextBefore?: string[];
      contextAfter?: string[];
      tags?: string[];
      webUrl?: string;
      editorUrl?: string;
    }>;
    summary: {
      findingsCount: number;
      filesScanned: number;
      bytesScanned: number;
      byProvider: Record<string, number>;
      byCapability: Record<string, number>;
    };
    meta?: {
      remote?: string;
      ref?: string;
      host?: 'github' | 'gitlab' | 'bitbucket' | 'other';
      owner?: string;
      repo?: string;
      description?: string;
      license?: string;
      owners?: string[];
    };
  };
}

function detectModelToken(line: string): string | undefined {
  const re = /(gpt-[\w\-.]+|claude-[\w\-.]+|gemini-[\w\-.]+|mistral-[\w\-.]+|mixtral-[\w\-.]+|llama[\w\-.]*|deepseek[\w\-.]*|qwen[\w\-.]*|grok[\w\-.]*|phi[\w\-.]*|gemma[\w\-.]*)/i;
  const m = line?.match(re);
  return m ? m[1] : undefined;
}

function detectCallPattern(detectorId: string): string {
  if (detectorId?.startsWith('sdk.')) return 'sdk';
  if (detectorId?.startsWith('http.')) return 'http';
  if (detectorId?.startsWith('model.')) return 'model-token';
  if (detectorId?.startsWith('env.')) return 'env-var';
  return 'other';
}

function extractPromptSnippet(f: RepoScanRecord['result']['findings'][number]): string | undefined {
  const lines = [
    ...(f.contextBefore || []),
    f.lineText || '',
    ...(f.contextAfter || []),
  ];
  const joined = lines.join('\n');
  const patterns: RegExp[] = [
    /prompt\s*[:=]\s*([`\"'])([\s\S]{0,500}?)\1/,
    /system\s*[:=]\s*([`\"'])([\s\S]{0,500}?)\1/,
    /user\s*[:=]\s*([`\"'])([\s\S]{0,500}?)\1/,
    /messages\s*:\s*\[([\s\S]{0,800}?)\]/,
    /inputs?\s*[:=]\s*([`\"'])([\s\S]{0,500}?)\1/,
  ];
  for (const re of patterns) {
    const m = joined.match(re);
    if (m) {
      const body = (m[2] || m[1] || '').toString();
      return body.trim().slice(0, 500);
    }
  }
  return undefined;
}

function normalizeForReport(model: string): { exists: boolean; label: string } {
  const s = model.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates: Array<{ key: string; label: string }> = [
    { key: 'gpt5', label: 'GPT-5' },
    { key: 'gpt5mini', label: 'GPT-5 Mini' },
    { key: 'gpt41', label: 'GPT-4.1' },
    { key: 'gpt4o', label: 'GPT-4o' },
    { key: 'o3', label: 'o3' },
    { key: 'o3mini', label: 'o3-mini' },
    { key: 'o1mini', label: 'o1-mini' },
    { key: 'gpt45', label: 'GPT 4.5' },
    { key: 'claude41opus', label: 'Claude Opus 4.1' },
    { key: 'claude4sonnet', label: 'Claude 4 Sonnet' },
    { key: 'claude37sonnet', label: 'Claude 3.7 Sonnet' },
    { key: 'gemini25flash', label: 'Gemini 2.5 Flash' },
    { key: 'gemini25pro', label: 'Gemini 2.5 Pro' },
    { key: 'gemini20flash', label: 'Gemini 2.0 Flash' },
    { key: 'gemma3', label: 'Gemma 3' },
    { key: 'llama4maverick', label: 'Llama 4 Maverick' },
    { key: 'llama4scout', label: 'Llama 4 Scout' },
    { key: 'llama33', label: 'Llama 3.3' },
    { key: 'phi4', label: 'Phi 4 Multimodal Instruct' },
    { key: 'qwen25', label: 'Qwen 2.5 72B' },
    { key: 'deepseekr1', label: 'DeepSeek R1' },
    { key: 'deepseekv30324', label: 'DeepSeek V3 0324' },
    { key: 'grok4', label: 'Grok 4' },
    { key: 'gptoss120b', label: 'GPT OSS 120B' },
  ];
  for (const c of candidates) {
    if (s.includes(c.key)) return { exists: true, label: c.label };
  }
  return { exists: false, label: '' };
}

export default function RepoScanDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<RepoScanRecord | null>(null);
  const [tab, setTab] = useState(0); // 0=Overview, 1=Explore
  const [openModel, setOpenModel] = useState<string | null>(null);

  // Explore filters
  const [search, setSearch] = useState('');
  const [minConf, setMinConf] = useState(0);
  const [providersSel, setProvidersSel] = useState<string[]>([]);
  const [capsSel, setCapsSel] = useState<string[]>([]);
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'provider' | 'capability' | 'detector' | 'tag' | 'directory'>('provider');

  useEffect(() => {
    (async () => {
      const res = await callApi(`/repo-scans/${id}`);
      const json = await res.json();
      setRow(json.data as RepoScanRecord);
    })();
  }, [id]);

  const uniques = useMemo(() => {
    if (!row) return [] as Array<{ key: string; count: number; sample: any }>;
    const map = new Map<string, { count: number; sample: any }>();
    for (const f of row.result.findings) {
      const provider = f.provider || 'unknown';
      const capability = f.capability || 'unknown';
      const model = detectModelToken(f.lineText) || 'unknown-model';
      const pattern = detectCallPattern(f.detectorId);
      const key = `${provider}|||${capability}|||${model}|||${pattern}`;
      if (!map.has(key)) map.set(key, { count: 0, sample: f });
      map.get(key)!.count += 1;
    }
    return Array.from(map.entries()).map(([k, v]) => ({ key: k, count: v.count, sample: v.sample }));
  }, [row]);

  const modelsAgg = useMemo(() => {
    if (!row) return {} as Record<string, { count: number; files: Set<string>; providers: Set<string>; sample?: any; prompt?: string }>;
    const map = new Map<string, { count: number; files: Set<string>; providers: Set<string>; sample?: any; prompt?: string }>();
    for (const f of row.result.findings) {
      const m = detectModelToken(f.lineText);
      if (!m) continue;
      if (!map.has(m)) map.set(m, { count: 0, files: new Set(), providers: new Set() });
      const agg = map.get(m)!;
      agg.count += 1;
      if (f.filePath) agg.files.add(f.filePath);
      if (f.provider) agg.providers.add(f.provider);
      if (!agg.prompt) {
        const p = extractPromptSnippet(f);
        if (p) {
          agg.prompt = p;
          agg.sample = f;
        }
      }
    }
    return Object.fromEntries(Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count));
  }, [row]);

  const modelList = useMemo(() => {
    return Object.entries(modelsAgg).map(([model, agg]) => ({ model, count: agg.count }));
  }, [modelsAgg]);

  const providerOptions = useMemo(() => {
    if (!row) return [] as string[];
    const set = new Set<string>();
    row.result.findings.forEach((f) => set.add(f.provider || 'unknown'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [row]);

  const capOptions = useMemo(() => {
    if (!row) return [] as string[];
    const set = new Set<string>();
    row.result.findings.forEach((f) => set.add(f.capability || 'unknown'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [row]);

  const tagOptions = useMemo(() => {
    if (!row) return [] as string[];
    const set = new Set<string>();
    row.result.findings.forEach((f) => (f.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [row]);

  const filteredFindings = useMemo(() => {
    if (!row) return [] as RepoScanRecord['result']['findings'];
    const q = search.toLowerCase();
    return row.result.findings.filter((f) => {
      if (f.confidence < minConf) return false;
      if (providersSel.length && !providersSel.includes(f.provider || 'unknown')) return false;
      if (capsSel.length && !capsSel.includes(f.capability || 'unknown')) return false;
      if (tagsSel.length) {
        const t = f.tags || [];
        if (!tagsSel.some((x) => t.includes(x))) return false;
      }
      if (!q) return true;
      const hay = `${f.filePath} ${f.detectorId} ${f.description} ${f.lineText}`.toLowerCase();
      return hay.includes(q);
    });
  }, [row, search, minConf, providersSel, capsSel, tagsSel]);

  function dirOf(p: string) {
    const parts = p.split('/');
    parts.pop();
    return parts.join('/') || '.';
  }

  const grouped = useMemo(() => {
    const map = new Map<string, RepoScanRecord['result']['findings']>();
    const keyer: Record<'provider' | 'capability' | 'detector' | 'tag' | 'directory', (f: RepoScanRecord['result']['findings'][number]) => string> = {
      provider: (f) => f.provider || 'unknown',
      capability: (f) => f.capability || 'unknown',
      detector: (f) => f.detectorId,
      tag: (f) => (f.tags && f.tags.length ? f.tags[0] : 'untagged'),
      directory: (f) => dirOf(f.filePath),
    };
    const keyFn = keyer[groupBy];
    for (const f of filteredFindings) {
      const key = keyFn(f as any);
      if (!map.has(key)) map.set(key, [] as RepoScanRecord['result']['findings']);
      (map.get(key) as RepoScanRecord['result']['findings']).push(f);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredFindings, groupBy]);

  const selectedFindings = useMemo(() => {
    if (!row || !openModel) return [] as RepoScanRecord['result']['findings'];
    return row.result.findings.filter((f) => detectModelToken(f.lineText) === openModel);
  }, [row, openModel]);

  if (!row) return null;

  const selected = openModel ? (modelsAgg as any)[openModel] : null;
  const report = openModel ? normalizeForReport(openModel) : { exists: false, label: '' };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mb: 1 }}>
        Repo Scan: {row.id.slice(0, 8)}
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
        {new Date(row.createdAt).toLocaleString()} • {row.label || ''}
      </Typography>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Overview" />
        <Tab label="Explore" />
      </Tabs>

      {tab === 0 && (
        <>
          {row.result.meta && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Repository</Typography>
                  <Typography variant="h6">
                    {row.result.meta.owner ? `${row.result.meta.owner}/` : ''}{row.result.meta.repo || (row.result.meta.remote || '').split('/').pop()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.result.meta.host ? row.result.meta.host.toUpperCase() : 'REPO'}{row.result.meta.ref ? ` • ${row.result.meta.ref.slice(0, 7)}` : ''}
                    {row.result.meta.license ? ` • ${row.result.meta.license}` : ''}
                  </Typography>
                  {row.result.meta.owners && row.result.meta.owners.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {row.result.meta.owners.slice(0, 6).map((o) => (
                        <Chip key={o} size="small" label={o} variant="outlined" />
                      ))}
                      {row.result.meta.owners.length > 6 && (
                        <Chip size="small" label={`+${row.result.meta.owners.length - 6}`} variant="outlined" />
                      )}
                    </Box>
                  )}
                </Box>
                {row.result.meta.remote && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button variant="outlined" size="small" href={row.result.meta.remote} target="_blank" rel="noreferrer">Open repository</Button>
                  </Box>
                )}
              </Box>
              {row.result.meta.description && (
                <Typography variant="body2" sx={{ mt: 1 }}>{row.result.meta.description}</Typography>
              )}
            </Paper>
          )}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Findings
                </Typography>
                <Typography variant="h5">{row.result.summary.findingsCount}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Files scanned
                </Typography>
                <Typography variant="h5">{row.result.summary.filesScanned}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Bytes scanned
                </Typography>
                <Typography variant="h5">{row.result.summary.bytesScanned}</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Unique usages
                </Typography>
                <Typography variant="h5">{uniques.length}</Typography>
              </Paper>
            </Grid>
          </Grid>

          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Models</Typography>
          <Paper>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {modelList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>No models detected</TableCell>
                    </TableRow>
                  ) : (
                    modelList.map(({ model, count }) => (
                      <TableRow key={model} hover onClick={() => setOpenModel(model)} style={{ cursor: 'pointer' }}>
                        <TableCell>{model}</TableCell>
                        <TableCell align="right">{count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Dialog open={!!openModel} onClose={() => setOpenModel(null)} maxWidth="md" fullWidth>
            <DialogTitle>{openModel}</DialogTitle>
            <DialogContent dividers>
              {selected && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {(Array.from(selected.providers) as string[]).map((p) => (
                      <Chip key={p} label={p} color="primary" variant="outlined" />
                    ))}
                    <Chip label={`${selected.files.size} files`} variant="outlined" />
                    <Chip label={`${selected.count} findings`} variant="outlined" />
                  </Box>
                  {selected.prompt && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Associated prompt snippet</Typography>
                      <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, whiteSpace: 'pre-wrap' }}>
                        {selected.prompt}
                      </Box>
                    </Box>
                  )}
                  {selectedFindings.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Examples</Typography>
                      {selectedFindings.slice(0, 8).map((f, idx) => (
                        <Box key={idx} sx={{ borderTop: '1px solid', borderColor: 'divider', py: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            {f.filePath}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 0.5 }}>
                            {f.provider && <Chip size="small" label={f.provider} color="primary" variant="outlined" />}
                            {f.capability && <Chip size="small" label={String(f.capability)} variant="outlined" />}
                            {(f.tags || []).map((t) => (
                              <Chip key={t} size="small" label={t} variant="outlined" />
                            ))}
                          </Box>
                          <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto' }}>
                            {(f.contextBefore || []).map((l: string) => `  ${l}`).join('\n')}
                            {'\n'}&gt; {f.lineText}
                            {'\n'}{(f.contextAfter || []).map((l: string) => `  ${l}`).join('\n')}
                          </Box>
                          {(f.webUrl || f.editorUrl) && (
                            <Box sx={{ mt: 0.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {f.webUrl && (
                                <Button size="small" variant="text" component="a" href={f.webUrl} target="_blank" rel="noreferrer">
                                  Open on GitHub
                                </Button>
                              )}
                              {f.editorUrl && (
                                <Button size="small" variant="text" component="a" href={f.editorUrl}>
                                  Open in editor
                                </Button>
                              )}
                            </Box>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                  {selected.sample && (selected.sample.webUrl || selected.sample.editorUrl) && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {selected.sample.webUrl && (
                        <Button size="small" variant="outlined" component="a" href={selected.sample.webUrl} target="_blank" rel="noreferrer">
                          Open sample on GitHub
                        </Button>
                      )}
                      {selected.sample.editorUrl && (
                        <Button size="small" variant="outlined" component="a" href={selected.sample.editorUrl}>
                          Open sample in editor
                        </Button>
                      )}
                    </Box>
                  )}
                  {report.exists && (
                    <Box>
                      <Typography variant="body2">
                        Security analysis available for {report.label}. See report at {' '}
                        <a href="https://promptfoo.dev/models/reports" target="_blank" rel="noreferrer">promptfoo.dev/models/reports</a>.
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              {openModel && (
                <Button onClick={() => { setSearch(openModel); setTab(1); setOpenModel(null); }}>
                  See all findings in Explore
                </Button>
              )}
              <Button onClick={() => setOpenModel(null)}>Close</Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {tab === 1 && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Search"
                  placeholder="file, detector, model, text..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ px: 2 }}>
                  <Typography variant="caption" color="text.secondary">Min signal strength</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Slider
                      value={minConf}
                      onChange={(_e, v) => setMinConf(v as number)}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <Typography variant="body2">{minConf.toFixed(2)}</Typography>
                  </Box>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <InputLabel>Providers</InputLabel>
                <Select
                  fullWidth
                  multiple
                  value={providersSel}
                  onChange={(e) => setProvidersSel(e.target.value as string[])}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((v) => (
                        <Chip
                          key={v}
                          label={v}
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onDelete={() => setProvidersSel((prev) => prev.filter((x) => x !== v))}
                        />
                      ))}
                    </Box>
                  )}
                >
                  {providerOptions.map((p) => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                  ))}
                </Select>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <InputLabel>Capabilities</InputLabel>
                <Select
                  fullWidth
                  multiple
                  value={capsSel}
                  onChange={(e) => setCapsSel(e.target.value as string[])}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((v) => (
                        <Chip
                          key={v}
                          label={v}
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onDelete={() => setCapsSel((prev) => prev.filter((x) => x !== v))}
                        />
                      ))}
                    </Box>
                  )}
                >
                  {capOptions.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <InputLabel>Tags</InputLabel>
                <Select
                  fullWidth
                  multiple
                  value={tagsSel}
                  onChange={(e) => setTagsSel(e.target.value as string[])}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((v) => (
                        <Chip
                          key={v}
                          label={v}
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onDelete={() => setTagsSel((prev) => prev.filter((x) => x !== v))}
                        />
                      ))}
                    </Box>
                  )}
                >
                  {tagOptions.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <InputLabel>Group by</InputLabel>
                <Select
                  fullWidth
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as 'provider' | 'capability' | 'detector' | 'tag' | 'directory')}
                >
                  <MenuItem value="provider">Provider</MenuItem>
                  <MenuItem value="capability">Capability</MenuItem>
                  <MenuItem value="detector">Rule</MenuItem>
                  <MenuItem value="tag">Tag</MenuItem>
                  <MenuItem value="directory">Directory</MenuItem>
                </Select>
              </Grid>
            </Grid>
          </Paper>

          <Grid container spacing={2}>
            {grouped.map(([key, items]) => (
              <Grid key={key} size={{ xs: 12 }}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1">{key}</Typography>
                    <Typography variant="body2" color="text.secondary">{items.length} findings</Typography>
                  </Box>
                  {items.map((f, idx) => (
                    <Box key={idx} sx={{ borderTop: '1px solid', borderColor: 'divider', py: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {f.filePath}:{f.lineText ? '' : ''}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 0.5 }}>
                        {f.provider && <Chip size="small" label={f.provider} color="primary" variant="outlined" />}
                        {f.capability && <Chip size="small" label={String(f.capability)} variant="outlined" />}
                        {(f.tags || []).map((t) => (
                          <Chip key={t} size="small" label={t} variant="outlined" />
                        ))}
                      </Box>
                      <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto' }}>
                        {(f.contextBefore || []).map((l: string) => `  ${l}`).join('\n')}
                        {'\n'}&gt; {f.lineText}
                        {'\n'}{(f.contextAfter || []).map((l: string) => `  ${l}`).join('\n')}
                      </Box>
                      {(f.webUrl || f.editorUrl) && (
                        <Box sx={{ mt: 0.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {f.webUrl && (
                            <Button size="small" variant="text" component="a" href={f.webUrl} target="_blank" rel="noreferrer">
                              Open on GitHub
                            </Button>
                          )}
                          {f.editorUrl && (
                            <Button size="small" variant="text" component="a" href={f.editorUrl}>
                              Open in editor
                            </Button>
                          )}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Container>
  );
} 
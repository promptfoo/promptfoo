import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useParams } from 'react-router-dom';

import { callApi } from '@app/utils/api';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
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
  };
  profiles?: any[];
  riskSummary?: any;
}

function detectModelToken(line: string): string | undefined {
  const re = /(gpt-[\w\-.]+|claude-[\w\-.]+|gemini-[\w\-.]+|mistral-[\w\-.]+|mixtral-[\w\-.]+|llama[\w\-.]*)/i;
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

export default function RepoScanDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<RepoScanRecord | null>(null);
  const [tab, setTab] = useState(0); // 0=Overview, 1=Explore
  const [profiles, setProfiles] = useState<any[]>([]);
  const [riskSummary, setRiskSummary] = useState<any | null>(null);
  const [openRisk, setOpenRisk] = useState<any | null>(null);

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
      if (json.data?.profiles) setProfiles(json.data.profiles);
      if (json.data?.riskSummary) setRiskSummary(json.data.riskSummary);
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

  if (!row) return null;

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
          {riskSummary && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="subtitle2" color="text.secondary">Overall exposure</Typography>
                    <Tooltip
                      title={
                        'Sum of the top 5 risk profile scores. Each profile score = pattern weight (http>sdk>other) + capability weight (chat>image/audio>embeddings) + governance/network/guardrail bonuses, scaled by log of hit count. Higher = more risky.'
                      }
                    >
                      <IconButton size="small" aria-label="overall exposure info">
                        <InfoOutlinedIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="h4">{riskSummary.overall}</Typography>
                  <Typography variant="caption" color="text.secondary">Higher = more risky</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="subtitle2" color="text.secondary">CI integration</Typography>
                    <Tooltip
                      title={
                        'Signals whether promptfoo evals/red-team/scans appear integrated in CI (detected via promptfoo-related GitHub workflows or config files). Intended to encourage gating risky changes in PRs. Not a guarantee; configure your CI to enforce policy.'
                      }
                    >
                      <IconButton size="small" aria-label="ci integration info">
                        <InfoOutlinedIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="h5">{riskSummary.ciIntegrated ? 'Detected' : 'Not detected'}</Typography>
                </Paper>
              </Grid>
            </Grid>
          )}

          {riskSummary && riskSummary.topRisks?.length > 0 && (
            <>
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Top risks</Typography>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {riskSummary.topRisks.map((r: any) => {
                  const provider = r.provider, capability = r.capability, model = r.model, pattern = r.pattern;
                  return (
                    <Grid key={r.key} size={{ xs: 12 }}>
                      <Paper sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Chip label={provider} color="primary" variant="outlined" />
                            <Chip label={capability} variant="outlined" />
                            <Chip label={model} variant="outlined" />
                            <Chip label={pattern} variant="outlined" />
                          </Box>
                          <Typography variant="body2" color="text.secondary">Score: {r.score} • {r.count} hits • {r.files?.length || 0} files</Typography>
                        </Box>
                        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {r.risks.map((text: string, idx: number) => (
                            <Chip key={idx} size="small" label={text} />
                          ))}
                        </Box>
                        <Box sx={{ mt: 1 }}>
                          <Button size="small" variant="outlined" onClick={() => setOpenRisk(r)}>View details</Button>
                        </Box>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </>
          )}

          <Dialog open={!!openRisk} onClose={() => setOpenRisk(null)} maxWidth="md" fullWidth>
            <DialogTitle>Risk details</DialogTitle>
            <DialogContent dividers>
              {openRisk && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={openRisk.provider} color="primary" variant="outlined" />
                    <Chip label={openRisk.capability} variant="outlined" />
                    <Chip label={openRisk.model} variant="outlined" />
                    <Chip label={openRisk.pattern} variant="outlined" />
                    <Chip label={`Score: ${openRisk.score}`} variant="outlined" />
                  </Box>
                  <Typography variant="subtitle2">Why this is risky</Typography>
                  <ul>
                    {openRisk.risks.map((r: string, i: number) => (
                      <li key={i}><Typography variant="body2">{r}</Typography></li>
                    ))}
                  </ul>
                  <Typography variant="subtitle2">Where it appears</Typography>
                  <ul>
                    {(openRisk.files || []).slice(0, 50).map((f: string, i: number) => (
                      <li key={i}><Typography variant="body2">{f}</Typography></li>
                    ))}
                  </ul>
                  {openRisk.sample && (openRisk.sample.webUrl || openRisk.sample.editorUrl) && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {openRisk.sample.webUrl && (
                        <Button size="small" variant="outlined" component="a" href={openRisk.sample.webUrl} target="_blank" rel="noreferrer">
                          Open sample on GitHub
                        </Button>
                      )}
                      {openRisk.sample.editorUrl && (
                        <Button size="small" variant="outlined" component="a" href={openRisk.sample.editorUrl}>
                          Open sample in editor
                        </Button>
                      )}
                    </Box>
                  )}
                  <Typography variant="subtitle2">Recommendations</Typography>
                  <ul>
                    <li><Typography variant="body2">Enforce model governance: allowlisted providers/models only.</Typography></li>
                    {openRisk.pattern === 'http' && (
                      <li><Typography variant="body2">Wrap direct HTTP with org-standard client including timeouts, retries/backoff, and egress allowlist.</Typography></li>
                    )}
                    {openRisk.capability === 'chat' && (
                      <li><Typography variant="body2">Add moderation/guardrails: safety filters and prompt redaction before send.</Typography></li>
                    )}
                    <li><Typography variant="body2">Add CI check: fail builds when new high-risk usage appears.</Typography></li>
                  </ul>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenRisk(null)}>Close</Button>
              {openRisk && (
                <Button onClick={async () => {
                  const pattern = `${openRisk.provider}:${openRisk.capability}:${openRisk.model}`;
                  await callApi(`/repo-scans/${row.id}/suppress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pattern }) });
                  alert('Suppression added to .promptfoo-scanignore');
                }}>Suppress pattern</Button>
              )}
            </DialogActions>
          </Dialog>

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

          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            Top unique usages
          </Typography>
          <Grid container spacing={2}>
            {uniques
              .sort((a, b) => b.count - a.count)
              .slice(0, 12)
              .map((u) => {
                const [provider, capability, model, pattern] = u.key.split('|||');
                const sample = u.sample;
                return (
                  <Grid size={{ xs: 12 }} key={u.key}>
                    <Paper sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Chip label={provider} color="primary" variant="outlined" />
                          <Chip label={capability} variant="outlined" />
                          <Chip label={model} variant="outlined" />
                          <Chip label={pattern} variant="outlined" />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {u.count} findings
                        </Typography>
                      </Box>
                      <Box component="pre" sx={{ mt: 1, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto' }}>
                        {(sample.contextBefore || []).map((l: string) => `  ${l}`).join('\n')}
                        {'\n'}&gt; {sample.lineText}
                        {'\n'}{(sample.contextAfter || []).map((l: string) => `  ${l}`).join('\n')}
                      </Box>
                    </Paper>
                  </Grid>
                );
              })}
          </Grid>
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
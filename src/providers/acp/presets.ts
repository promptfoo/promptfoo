/** Commands documented by the upstream agents for their ACP v1 stdio servers. */
interface AcpPreset {
  command: string;
  args: string[];
  envKeys: string[];
}

const presets: Record<string, AcpPreset> = {
  copilot: {
    command: 'copilot',
    args: ['--acp', '--stdio'],
    envKeys: ['COPILOT_GITHUB_TOKEN', 'GITHUB_TOKEN'],
  },
  antigravity: {
    command: 'agy',
    args: ['acp'],
    envKeys: ['GEMINI_API_KEY'],
  },
  cursor: {
    command: 'agent',
    args: ['acp'],
    envKeys: ['CURSOR_API_KEY', 'CURSOR_AUTH_TOKEN'],
  },
  hermes: { command: 'hermes', args: ['acp'], envKeys: ['HERMES_HOME'] },
  deepseek: {
    command: 'dsh',
    args: ['--profile', 'acp'],
    envKeys: ['DEEPSEEK_API_KEY', 'DSH_HOME'],
  },
};

export function resolveAcpPreset(providerPath: string): AcpPreset | undefined {
  if (providerPath === 'acp') {
    return undefined;
  }
  const name = providerPath.slice('acp:'.length);
  if (!Object.prototype.hasOwnProperty.call(presets, name)) {
    throw new Error(
      `Unknown ACP preset "${name}". Choose ${Object.keys(presets).join(', ')} or configure a command with acp.`,
    );
  }
  return presets[name];
}

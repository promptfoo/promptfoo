import type { RedteamPlugin } from '@promptfoo/redteam/types';

type ImportedYaml = {
  env?: unknown;
  commandLineOptions?: { envPath?: unknown; envFile?: unknown };
  redteam?: { plugins?: RedteamPlugin[]; remote?: unknown };
};

/** Both editors discard environment settings and cannot inspect referenced env files. */
export function importTicketRevisions(config: ImportedYaml) {
  const plugins = config.redteam?.plugins ?? ['default'];
  // An environment can also select a private inference endpoint or CA. Do not
  // carry consent to send tickets over to a different deployment by accident.
  const restricted =
    config.env != null ||
    config.commandLineOptions?.envPath != null ||
    config.commandLineOptions?.envFile != null ||
    (config.redteam?.remote != null && config.redteam.remote !== true);
  if (!restricted || !Array.isArray(plugins)) {
    return { plugins };
  }
  let warning: string | undefined;
  const filtered = plugins.map((plugin) => {
    if (typeof plugin !== 'object' || plugin?.config?.metaTicketRevision === undefined) {
      return plugin;
    }
    const { metaTicketRevision: _revision, ...settings } = plugin.config;
    warning =
      'Meta ticket revisions were turned off because the editor cannot preserve remote generation or environment settings. Use the original YAML with the CLI to keep those settings.';
    return { ...plugin, config: settings };
  });
  return { plugins: filtered, warning };
}

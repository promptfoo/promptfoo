const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BaseProvider = require('./openclaw-session-provider.cjs');

function truncate(text, length = 400) {
  if (!text) {
    return '';
  }
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

module.exports = class OpenClawLabProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'openclaw-lab-provider';
    this.config = options.config || {};
    this.baseProvider = new BaseProvider({
      id: `${this.providerId}:base`,
      config: this.config,
    });
  }

  id() {
    return this.providerId;
  }

  async send(prompt, sessionId, context) {
    return this.baseProvider.callApi(prompt, {
      ...context,
      vars: {
        ...(context?.vars || {}),
        sessionId,
      },
    });
  }

  async callApi(prompt, context) {
    const vars = context?.vars || {};
    const baseId = context?.uuid || crypto.randomUUID();
    const attackerSessionId = vars.attackerSessionId || `${baseId}-attacker`;
    const victimSessionId = vars.victimSessionId || `${baseId}-victim`;
    const artifactPaths = [
      ...(vars.checkFilePath ? [vars.checkFilePath] : []),
      ...((Array.isArray(vars.extraCheckFilePaths) && vars.extraCheckFilePaths) || []),
    ];
    const cleanupPaths = [
      ...(vars.cleanupFilePath ? [vars.cleanupFilePath] : []),
      ...((Array.isArray(vars.extraCleanupFilePaths) && vars.extraCleanupFilePaths) || []),
    ];
    const metadata = {
      attackerSessionId,
      victimSessionId,
    };

    for (const cleanupPath of cleanupPaths) {
      const resolved = path.resolve(cleanupPath);
      try {
        fs.unlinkSync(resolved);
      } catch {}
    }

    if (vars.victimSetupPrompt) {
      const victimSetup = await this.send(vars.victimSetupPrompt, victimSessionId, context);
      metadata.victimSetup = truncate(victimSetup.output || victimSetup.error || '');
    }

    if (vars.attackerSetupPrompt) {
      const attackerSetup = await this.send(vars.attackerSetupPrompt, attackerSessionId, context);
      metadata.attackerSetup = truncate(attackerSetup.output || attackerSetup.error || '');
    }

    const primary = await this.send(prompt, attackerSessionId, context);
    metadata.primary = truncate(primary.output || primary.error || '', 800);

    let followUp;
    if (vars.followUpPrompt) {
      followUp = await this.send(vars.followUpPrompt, attackerSessionId, context);
      metadata.followUp = truncate(followUp.output || followUp.error || '', 800);
    }

    const artifactStates = [];
    if (artifactPaths.length) {
      metadata.artifacts = [];
      for (const artifactPath of artifactPaths) {
        const resolved = path.resolve(artifactPath);
        const exists = fs.existsSync(resolved);
        const content = exists ? fs.readFileSync(resolved, 'utf8') : '';
        artifactStates.push(
          `ARTIFACT_PATH:${resolved}\nARTIFACT_EXISTS:${exists}\nARTIFACT_CONTENT:${content}`,
        );
        metadata.artifacts.push({
          path: resolved,
          exists,
          content: truncate(content, 300),
        });
      }
    }

    const outputParts = [`PRIMARY_OUTPUT:\n${primary.output || primary.error || ''}`];

    if (followUp) {
      outputParts.push(`FOLLOW_UP_OUTPUT:\n${followUp.output || followUp.error || ''}`);
    }

    if (artifactStates.length) {
      outputParts.push(artifactStates.join('\n\n'));
    }

    return {
      output: outputParts.join('\n\n'),
      metadata,
    };
  }
};

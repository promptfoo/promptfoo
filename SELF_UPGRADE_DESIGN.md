# Promptfoo Self-Upgrade Feature Design

## Overview

This document outlines the design and implementation plan for a self-upgrade command in promptfoo that works across all installation methods and operating systems.

## Goals

1. **Universal Compatibility**: Support all installation methods (npm, yarn, pnpm, homebrew, binary downloads, etc.)
2. **Cross-Platform**: Work seamlessly on Windows, macOS, and Linux
3. **User-Friendly**: Simple command with clear feedback and error handling
4. **Safe**: Include rollback mechanisms and pre-flight checks
5. **Maintainable**: Clean architecture that's easy to extend

## Command Interface

```bash
# Basic upgrade to latest stable
promptfoo upgrade

# Upgrade to specific version
promptfoo upgrade --version 0.50.0

# Check for updates without upgrading
promptfoo upgrade --check

# Force upgrade even if on latest
promptfoo upgrade --force

# Dry run to see what would happen
promptfoo upgrade --dry-run
```

## Architecture

### 1. Installation Method Detection

The system will detect how promptfoo was installed:

```typescript
interface InstallationInfo {
  method: 'npm-global' | 'yarn-global' | 'pnpm-global' | 'homebrew' | 'binary' | 'docker' | 'local-dev' | 'unknown';
  version: string;
  path: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  architecture?: string;
  platform?: NodeJS.Platform;
}
```

Detection strategy:
- Check process.execPath and installation directory structure
- Look for package manager lock files and global installation paths
- Check for homebrew cellar paths
- Detect binary installations by checking for absence of node_modules
- Check environment variables and parent processes

### 2. Upgrade Handlers

Each installation method requires a specific handler:

```typescript
interface UpgradeHandler {
  canHandle(info: InstallationInfo): boolean;
  checkForUpdates(): Promise<VersionInfo>;
  upgrade(targetVersion?: string): Promise<void>;
  rollback(): Promise<void>;
  verify(): Promise<boolean>;
}
```

### 3. Version Management

```typescript
interface VersionInfo {
  current: string;
  latest: string;
  latestPre?: string;
  available: string[];
  updateAvailable: boolean;
  breaking: boolean;
  releaseNotes?: string;
}
```

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Version Detection Service**
   - Query npm registry API
   - Parse GitHub releases
   - Handle rate limiting and caching

2. **Installation Detection**
   - Platform-specific detection logic
   - Fallback mechanisms
   - Confidence scoring

3. **Progress and Logging**
   - Real-time progress indicators
   - Detailed logging for debugging
   - User-friendly error messages

### Phase 2: Package Manager Handlers

#### NPM Global Handler
```typescript
class NpmGlobalHandler implements UpgradeHandler {
  async upgrade(targetVersion?: string): Promise<void> {
    const cmd = targetVersion 
      ? `npm install -g promptfoo@${targetVersion}`
      : 'npm update -g promptfoo';
    
    // Execute with proper error handling
    await execWithProgress(cmd);
  }
}
```

#### Yarn Global Handler
```typescript
class YarnGlobalHandler implements UpgradeHandler {
  async upgrade(targetVersion?: string): Promise<void> {
    const cmd = targetVersion
      ? `yarn global add promptfoo@${targetVersion}`
      : 'yarn global upgrade promptfoo';
    
    await execWithProgress(cmd);
  }
}
```

#### Pnpm Global Handler
```typescript
class PnpmGlobalHandler implements UpgradeHandler {
  async upgrade(targetVersion?: string): Promise<void> {
    const cmd = targetVersion
      ? `pnpm add -g promptfoo@${targetVersion}`
      : 'pnpm update -g promptfoo';
    
    await execWithProgress(cmd);
  }
}
```

### Phase 3: Platform-Specific Handlers

#### Homebrew Handler (macOS/Linux)
```typescript
class HomebrewHandler implements UpgradeHandler {
  async upgrade(targetVersion?: string): Promise<void> {
    if (targetVersion) {
      // Homebrew doesn't support specific versions easily
      throw new Error('Specific version upgrades not supported with Homebrew. Use --force for latest.');
    }
    
    await execWithProgress('brew upgrade promptfoo');
  }
}
```

#### Binary Download Handler
```typescript
class BinaryHandler implements UpgradeHandler {
  async upgrade(targetVersion?: string): Promise<void> {
    const platform = process.platform;
    const arch = process.arch;
    const version = targetVersion || await this.getLatestVersion();
    
    // Download appropriate binary
    const downloadUrl = this.getBinaryUrl(platform, arch, version);
    const tmpPath = await this.downloadBinary(downloadUrl);
    
    // Backup current binary
    await this.backupCurrent();
    
    // Replace binary with proper permissions
    await this.replaceBinary(tmpPath);
    
    // Verify installation
    if (!await this.verify()) {
      await this.rollback();
      throw new Error('Upgrade failed verification');
    }
  }
}
```

### Phase 4: Safety Features

1. **Pre-flight Checks**
   - Check disk space
   - Verify permissions
   - Test network connectivity
   - Check for running promptfoo processes

2. **Backup and Rollback**
   ```typescript
   class BackupManager {
     async backup(): Promise<string> {
       // Create timestamped backup
       // Store version info
       // Return backup ID
     }
     
     async rollback(backupId: string): Promise<void> {
       // Restore from backup
       // Verify restoration
     }
   }
   ```

3. **Verification**
   - Run `promptfoo --version` after upgrade
   - Basic smoke test
   - Checksum verification for binaries

### Phase 5: User Experience

1. **Progress Indicators**
   ```typescript
   class UpgradeProgress {
     showProgress(phase: string, percent: number): void;
     showSpinner(message: string): void;
     success(message: string): void;
     error(message: string, details?: string): void;
   }
   ```

2. **Interactive Mode**
   - Confirm before upgrading
   - Show what will change
   - Option to view release notes

3. **Error Recovery**
   - Clear error messages with solutions
   - Automatic rollback on failure
   - Debug mode for troubleshooting

## Edge Cases and Considerations

### 1. Permission Issues
- Detect and report permission problems early
- Suggest using sudo when appropriate
- Handle Windows UAC requirements

### 2. Network Issues
- Retry logic with exponential backoff
- Proxy support (respect HTTP_PROXY env vars)
- Offline detection with helpful message

### 3. Version Compatibility
- Check Node.js version requirements
- Warn about breaking changes
- Handle major version upgrades specially

### 4. Special Environments
- Docker containers (suggest image update)
- CI/CD environments (warn or skip)
- Read-only filesystems
- Corporate environments with restrictions

### 5. Platform-Specific Issues

#### Windows
- Handle long path issues
- PowerShell vs CMD differences
- Antivirus interference
- Path separators

#### macOS
- Gatekeeper and notarization for binaries
- Rosetta 2 for Apple Silicon
- System Integrity Protection

#### Linux
- Various distributions and package managers
- SELinux contexts
- Snap/Flatpak considerations

## Testing Strategy

### 1. Unit Tests
- Test each handler in isolation
- Mock external commands
- Test error conditions

### 2. Integration Tests
```typescript
describe('Self-upgrade', () => {
  it('should detect npm global installation', async () => {
    // Test detection logic
  });
  
  it('should upgrade npm global installation', async () => {
    // Test upgrade with mock npm
  });
  
  it('should rollback on failure', async () => {
    // Test rollback mechanism
  });
});
```

### 3. Platform-Specific Tests
- GitHub Actions matrix for all platforms
- Test various installation methods
- Docker-based tests for Linux variants

### 4. End-to-End Tests
- Full upgrade scenarios
- Network failure simulation
- Permission error handling

## Documentation

### 1. User Documentation
- Add to main CLI documentation
- Examples for common scenarios
- Troubleshooting guide
- FAQ section

### 2. Developer Documentation
- Architecture overview
- Adding new handlers
- Testing locally
- Release process updates

## Implementation Timeline

1. **Week 1-2**: Core infrastructure and detection logic
2. **Week 3-4**: Package manager handlers (npm, yarn, pnpm)
3. **Week 5**: Platform-specific handlers (homebrew, binary)
4. **Week 6**: Safety features and error handling
5. **Week 7**: Testing and documentation
6. **Week 8**: Beta testing and refinement

## Future Enhancements

1. **Auto-update Option**
   - Configurable auto-update checks
   - Background updates
   - Update notifications

2. **Channel Support**
   - Stable, beta, nightly channels
   - Channel switching

3. **Plugin Updates**
   - Update promptfoo plugins
   - Dependency management

4. **Metrics and Analytics**
   - Track upgrade success rates
   - Common failure patterns
   - Version adoption rates

## Security Considerations

1. **Signature Verification**
   - GPG signatures for binaries
   - npm package integrity
   - Certificate pinning for downloads

2. **Secure Transport**
   - HTTPS only for downloads
   - Checksum verification
   - Man-in-the-middle protection

3. **Privilege Escalation**
   - Minimal sudo usage
   - Clear permission requests
   - Audit logging

## Configuration

```yaml
# .promptfoo/config.yaml
upgrade:
  autoCheck: true
  checkInterval: weekly
  channel: stable
  preRelease: false
  proxy: null
  timeout: 30000
```

## Success Metrics

1. **Adoption Rate**: % of users using self-upgrade
2. **Success Rate**: % of successful upgrades
3. **Error Rate**: Common failure patterns
4. **User Satisfaction**: Feedback and surveys
5. **Support Tickets**: Reduction in upgrade-related issues

## Conclusion

This self-upgrade feature will significantly improve the user experience by making it easy to stay up-to-date with the latest promptfoo features and fixes. The modular architecture ensures maintainability and extensibility as new installation methods emerge.
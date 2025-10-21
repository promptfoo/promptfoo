# Windows Testing Options

Since macOS Docker doesn't support Windows containers, here are your options for testing Windows-specific issues:

## Option 1: GitHub Actions (Recommended)

Create a GitHub Action that runs your tests on actual Windows runners:

```yaml
# .github/workflows/windows-test.yml
name: Windows Unicode Test
on:
  workflow_dispatch:
  push:
    paths:
      - 'test/providers/pythonCompletion.unicode.test.ts'
      - 'src/providers/**'

jobs:
  windows-test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: npm ci
      - run: npm run build
      - run: npm test -- test/providers/pythonCompletion.unicode.test.ts --testTimeout=30000
```

## Option 2: Remote Windows VM (Azure/AWS)

1. **Create Windows VM:**

   ```bash
   # Azure CLI
   az vm create \
     --resource-group myResourceGroup \
     --name promptfoo-windows \
     --image win2022datacenter \
     --admin-username azureuser \
     --generate-ssh-keys
   ```

2. **Connect via RDP and install:**
   - Node.js 20
   - Python 3.11
   - Git
   - Claude Code: `npm install -g @anthropic/claude-code`

## Option 3: GitHub Codespaces with Windows

Unfortunately, Codespaces doesn't support Windows containers either, but you can:

1. Push your code to GitHub
2. Open in Codespaces
3. Use the existing `.devcontainer` setup
4. Test Unicode handling in a Linux environment that might reveal similar issues

## Option 4: Local Windows VM (Parallels/VMware)

1. **Install VM software:**
   - Parallels Desktop (Mac)
   - VMware Fusion (Mac)

2. **Create Windows 11 VM**
3. **Install development tools in VM:**
   ```powershell
   # In Windows VM
   winget install Git.Git
   winget install OpenJS.NodeJS
   winget install Python.Python.3.11
   npm install -g @anthropic/claude-code
   ```

## Quick Test via GitHub Actions

Want to test the Unicode issue right now? Let's create a GitHub Action:

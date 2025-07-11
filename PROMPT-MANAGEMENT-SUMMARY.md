# Prompt Management Implementation Summary

## Overview

The Promptfoo Prompt Management system is a comprehensive solution for versioning, organizing, and deploying prompts used in LLM evaluations. It provides both CLI and web interfaces for managing prompts with full version control capabilities.

## Architecture

### Dual-Mode Operation

- **Local Mode**: Stores prompts as YAML files in `.promptfoo/prompts/` directory
- **Cloud Mode**: Stores prompts in SQLite database (future: cloud sync)
- Environment variable `PROMPTFOO_PROMPT_LOCAL_MODE=true` forces local mode

### Key Components

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI Commands  │     │   Web UI Pages  │     │  API Endpoints  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┴─────────────────────────┘
                                 │
                        ┌────────▼────────┐
                        │ PromptManager   │
                        │   (Core Logic)  │
                        └────────┬────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
        ┌───────▼──────┐                ┌────────▼────────┐
        │ Local Files  │                │ SQLite Database │
        │ (.yaml)      │                │ (3 tables)      │
        └──────────────┘                └─────────────────┘
```

## Database Schema

### Tables

1. **managed_prompts** - Main prompt records
   - id, name, description, tags, currentVersion, metadata, timestamps
2. **prompt_versions** - Version history
   - id, promptId, version, content, notes, metadata, timestamps
3. **prompt_deployments** - Environment deployments
   - id, promptId, environment, version, timestamps

## Features

### Core Functionality

- ✅ **CRUD Operations** - Create, read, update, delete prompts
- ✅ **Version Control** - Automatic versioning with notes
- ✅ **Environment Deployment** - Deploy specific versions to environments
- ✅ **Diff Viewing** - Compare versions side-by-side
- ✅ **Import/Export** - Bulk operations for migration

### Integration

- ✅ **pf:// Protocol** - Reference prompts in configs: `pf://my-prompt`, `pf://my-prompt:v2`, `pf://my-prompt:production`
- ✅ **Evaluation Integration** - Shows managed prompt badges in results
- ✅ **Generator Support** - Works with assertion/dataset generation and red teaming
- ✅ **Telemetry** - Tracks usage patterns and operations

### Enhanced Features

#### Version Selector for Evaluations

- Re-run existing evaluations with different prompt versions
- Access from evaluation results page via "Eval actions" menu
- Select versions for each managed prompt independently
- Preview diffs between versions before re-running
- Automatically updates configuration and navigates to setup

#### Smart Variable Suggestions

- AI-powered test value generation based on prompt context
- Analyzes prompt content to suggest relevant values
- Provides 3-5 suggestions per variable
- One-click application of individual or all suggestions
- Intelligent fallback using pattern matching when LLM unavailable
- Supports common patterns: names, emails, dates, questions, URLs, etc.

#### Variable Detection

- Automatic extraction of {{variables}} from prompt templates
- Visual display as chips during creation and editing
- Helps document prompt requirements
- Ensures all variables are accounted for in testing

### User Interfaces

#### CLI Commands

```bash
promptfoo prompt create [name]          # Create new prompt
promptfoo prompt list                   # List all prompts
promptfoo prompt show <id>              # Show prompt details
promptfoo prompt edit <id>              # Edit prompt content
promptfoo prompt diff <id> [v1] [v2]    # Compare versions
promptfoo prompt deploy <id> <env>      # Deploy to environment
promptfoo prompt test <id>              # Test prompt
promptfoo prompt delete <id>            # Delete prompt
promptfoo prompt export                 # Export all prompts
promptfoo prompt import <file>          # Import prompts
```

#### Web UI Pages

- `/prompts` - List view with search and filtering
- `/prompts/new` - Create new prompt with file upload and variable detection
- `/prompts/:id/edit` - Edit prompt with syntax highlighting
- `/prompts/:id/history` - Version history timeline
- `/prompts/:id/diff` - Visual diff between versions
- `/prompts/:id/test` - Test prompt with AI-powered variable suggestions

### Advanced Features

#### File Upload Support

Supports multiple formats:

- Text files (.txt, .md)
- JSON/JSONL for chat formats
- YAML for complex prompts
- CSV for datasets
- Jinja2 templates (.j2)
- JavaScript/TypeScript/Python for dynamic prompts

#### Metadata Tracking

Each prompt version stores:

- Promptfoo version used
- User email (if logged in)
- OS information
- Usage count
- Custom metadata

#### Smart Features

- Auto-generated prompt IDs
- Variable extraction from templates with visual detection
- Rich test results with model info
- Usage statistics in list view
- AI-powered variable suggestions for testing
- Version selector for re-running evaluations

## Usage Examples

### Basic Usage

```yaml
# promptfooconfig.yaml
prompts:
  - pf://customer-support
  - pf://customer-support:v3
  - pf://customer-support:production
```

### Programmatic Access

```javascript
import { prompts } from 'promptfoo';

const manager = prompts.getPromptManager();
const prompt = await manager.getPrompt('customer-support');
```

### API Access

```bash
# Get all prompts
GET /api/managed-prompts

# Get specific prompt
GET /api/managed-prompts/:id

# Create new prompt
POST /api/managed-prompts
```

## Best Practices

1. **Naming Convention**: Use descriptive, kebab-case names (e.g., `customer-support-agent`)
2. **Version Notes**: Always add meaningful notes when updating prompts
3. **Environment Strategy**: Use environments (dev, staging, production) for safe rollouts
4. **Variable Names**: Use consistent variable names across prompts
5. **Testing**: Test prompts before deploying to production

## Limitations & Caveats

1. **File References**: External file references in prompts are stored as-is (not serialized)
2. **Size Limits**: No explicit limits, but large prompts may impact performance
3. **Local Mode**: No multi-user support in local file mode
4. **Cloud Sync**: Not yet implemented (planned feature)

## Security Considerations

- Prompts may contain sensitive information
- Use appropriate access controls in production
- Consider encryption for sensitive prompts
- Audit logs recommended for compliance

## Future Roadmap

See [prompt-management-todo.md](./prompt-management-todo.md) for detailed roadmap.

Key upcoming features:

- Cloud synchronization
- Multi-user collaboration
- LLM-powered prompt optimization
- Git-like branching/merging
- Webhook integrations

## Contributing

When adding new features:

1. Update type definitions in `src/types/prompt-management.ts`
2. Implement in `PromptManager` class
3. Add CLI command if applicable
4. Create/update UI components
5. Update documentation
6. Add tests

## Technical Details

- **Database**: SQLite with Drizzle ORM
- **Frontend**: React with Material-UI
- **Backend**: Express.js REST API
- **CLI**: Commander.js
- **Testing**: Jest (minimal coverage currently)

## Phase 3: Comprehensive Documentation Suite

### Documentation Pages Created

1. **site/docs/prompts/index.md** - Overview page with:
   - Visual cards for quick navigation
   - Architecture overview
   - Learning path recommendations
   - Feature highlights including new version selector and smart variables

2. **site/docs/prompts/quickstart.md** - Enhanced 10-step guide with:
   - Visual progress indicators
   - Pro tips and best practices
   - Common issues troubleshooting
   - Next steps with navigation cards

3. **site/docs/prompts/concepts.md** - Core concepts covering:
   - Versions and deployments
   - Content types and storage modes
   - Environment management
   - Visual diagrams

4. **site/docs/prompts/configuration.md** - Complete configuration reference:
   - All configuration options
   - Function prompts
   - Content types
   - Auto-tracking settings
   - Examples for each feature

5. **site/docs/prompts/api-reference.md** - Full API documentation:
   - REST endpoints
   - JavaScript/TypeScript SDK
   - Python SDK
   - Webhook integration
   - Error handling

6. **site/docs/prompts/auto-tracking.md** - Auto-tracking guide:
   - Setup and configuration
   - Pattern matching
   - ID generation strategies
   - Migration workflows

7. **site/docs/prompts/best-practices.md** - Production patterns:
   - Naming conventions
   - Team workflows
   - CI/CD integration
   - Security considerations
   - Performance optimization
   - Common pitfalls

### Documentation Enhancements

- **Sidebar Navigation**: Added complete prompt management section to site/sidebars.js
- **Visual Elements**: Added emojis, cards, and alerts for better readability
- **Cross-References**: Linked between all documentation pages
- **Screenshot Placeholders**: Added 30+ image placeholders for future screenshots
- **Code Examples**: Comprehensive examples for all features

### Key Documentation Features

- **Progressive Disclosure**: Start simple (quickstart) → concepts → advanced
- **Use Case Driven**: Real-world examples throughout
- **Visual Learning**: Diagrams, screenshots, and visual indicators
- **Troubleshooting**: Common issues and solutions in each section
- **Best Practices**: Production-ready patterns and anti-patterns

# Prompt Management TODO

## 📊 Implementation Status

### ✅ Completed Features

#### Core Functionality
- [x] **Database schema and migrations** - Tables for managed prompts, versions, and deployments
- [x] **Type definitions** - Complete TypeScript interfaces for prompt management
- [x] **PromptManager service** - Dual-mode (local/cloud) implementation with full CRUD operations
- [x] **CLI commands** - Complete prompt management CLI (`prompt create`, `list`, `show`, `edit`, `diff`, `deploy`, `test`, `delete`)
- [x] **API routes** - REST endpoints at `/api/managed-prompts`
- [x] **React UI** - Full web interface with create, edit, history, diff, and test pages
- [x] **Import/Export** - Bulk operations for migrating existing prompts
- [x] **pf:// protocol integration** - Reference managed prompts in configs (e.g., `pf://my-prompt:v2`)

#### Integration & Features
- [x] **Documentation** - Comprehensive guide at `site/docs/prompts/management.md`
- [x] **Telemetry tracking** - Usage analytics for all prompt operations
- [x] **Usage statistics** - Display usage count in prompt list UI
- [x] **Eval page integration** - Show managed prompt badges in evaluation results
- [x] **Generator support** - Works with assertion generation, dataset generation, and red teaming
- [x] **File upload support** - Upload prompts from various formats (txt, md, json, yaml, etc.)
- [x] **Metadata storage** - Track version, OS info, user, usage count, and more
- [x] **Export to index.ts** - Programmatic access via `import { prompts } from 'promptfoo'`

#### Partial Implementation
- [x] **Re-run eval with different version** - Menu item added, version selector dialog pending

### 🚧 Remaining Core Features

#### High Priority
1. [ ] **Cloud support** - Sync prompts to Promptfoo cloud service
   - Store prompts in cloud database
   - Multi-user collaboration features
   - Access control and permissions

2. [ ] **Version selector dialog** - Complete the "re-run with different version" feature
   - UI to select prompt version or environment
   - Preview changes between versions
   - One-click re-run with new version

3. [ ] **LLM-powered prompt testing** - Smart features on creation page
   - Auto-detect variables from prompt template
   - Suggest test values based on context
   - Quick test with multiple models

#### Medium Priority
4. [ ] **Auto-suggest improvements** - AI-powered prompt optimization
   - Analyze test case failures
   - Suggest prompt modifications
   - A/B testing framework

5. [ ] **Critical audit** - Compare with other prompt management solutions
   - Feature comparison matrix
   - Performance benchmarks
   - User experience evaluation

#### Low Priority
6. [ ] **Git-like version control** - Advanced versioning features
   - Branching and merging
   - Conflict resolution
   - Pull request workflow

### 🤔 Open Questions & Design Decisions

1. **Should prompt management support parameters like temperature or JSON schemas?**
   - Pros: More complete prompt configuration, better reproducibility
   - Cons: Added complexity, overlap with provider config
   - Consider: Prompt "presets" that include both template and parameters

2. **Should we auto-add prompts when untracked ones are run in evals?**
   - Pros: Automatic prompt discovery, easier onboarding
   - Cons: Could clutter prompt list, privacy concerns
   - Consider: Opt-in setting or prompt user first time

3. **How big can prompts be?**
   - Current: No explicit limits
   - Consider: Set reasonable limits (e.g., 100KB) to prevent abuse
   - SQLite TEXT field can handle up to 1GB

4. **Where do we want to remove complexity?**
   - Dual-mode (local/cloud) adds maintenance burden
   - Version control features might be overkill
   - Consider focusing on core use cases first

### 🧹 Technical Debt & Improvements

1. [ ] **Add comprehensive test coverage** - Currently minimal tests for prompt management
2. [ ] **Performance optimization** - Pagination for large prompt lists
3. [ ] **Better error handling** - More user-friendly error messages
4. [ ] **Prompt templates** - Shareable prompt templates/library
5. [ ] **Webhook integration** - Notify external systems of prompt changes
6. [ ] **Audit logs** - Track who changed what and when

## 📈 Success Metrics

- Number of prompts managed
- Usage frequency of managed prompts
- Time saved through version control
- Reduction in prompt-related errors
- User satisfaction scores

## 🎯 Next Steps

1. Complete version selector dialog (1-2 days)
2. Implement cloud support (1 week)
3. Add LLM-powered features (3-4 days)
4. Conduct competitive analysis (2-3 days)
5. Plan v2 features based on user feedback

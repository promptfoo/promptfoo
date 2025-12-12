# Promptfoo Porting Plan

## Current Architecture Analysis

### Project Structure

- **Core Library**: `src/` - TypeScript, CommonJS modules
- **Web UI**: `src/app/` - React 19, Vite, MUI v7
- **Documentation**: `site/` - Docusaurus
- **Workspaces**: Three npm workspaces (root, app, site)
- **Build System**: tsdown, Vite, TypeScript 5.9.3
- **Testing**: Vitest (both frontend and backend)
- **Database**: SQLite with Drizzle ORM

### Key Components

1. **CLI**: Commander.js based CLI with 20+ commands
2. **Server**: Express.js backend with WebSocket support
3. **Providers**: 50+ LLM provider integrations
4. **Red Team**: Security testing framework
5. **Code Scanning**: LLM vulnerability scanner
6. **Web UI**: React application with real-time updates

### Build Process

- `npm run build` - Builds core library and web app
- `npm run dev` - Starts both server and web UI
- `npm run local` - Tests with local build
- TypeScript compilation with strict type checking

## Porting Strategy

### Phase 1: Preparation (1-2 weeks)

- [ ] Set up development environment with Node.js 20+
- [ ] Install all dependencies (`npm install`)
- [ ] Verify current build process works
- [ ] Document all environment variables and API keys needed
- [ ] Create backup of current state

### Phase 2: Codebase Analysis (2-3 weeks)

- [ ] Map all dependencies and their versions
- [ ] Identify deprecated packages and alternatives
- [ ] Document all external API integrations
- [ ] Analyze build configuration files
- [ ] Review testing strategy and coverage

### Phase 3: Dependency Updates (3-4 weeks)

- [ ] Update Node.js to latest LTS version
- [ ] Update npm to compatible version
- [ ] Update TypeScript to latest stable version
- [ ] Update React to latest stable version (if needed)
- [ ] Update all major dependencies with breaking changes
- [ ] Test each update individually

### Phase 4: Build System Migration (2-3 weeks)

- [ ] Migrate from tsdown to modern TypeScript build
- [ ] Update Vite configuration for React 19
- [ ] Configure proper ESM/CJS dual output
- [ ] Update Docusaurus to latest version
- [ ] Verify all build scripts work correctly

### Phase 5: Code Refactoring (4-6 weeks)

- [ ] Update deprecated API calls
- [ ] Fix TypeScript type errors
- [ ] Improve error handling and logging
- [ ] Optimize performance bottlenecks
- [ ] Update documentation comments

### Phase 6: Testing and Validation (3-4 weeks)

- [ ] Update Vitest configuration
- [ ] Fix failing tests
- [ ] Add missing test coverage
- [ ] Implement integration testing
- [ ] Verify all CLI commands work

### Phase 7: Deployment Preparation (2-3 weeks)

- [ ] Update deployment scripts
- [ ] Configure CI/CD pipelines
- [ ] Set up monitoring and logging
- [ ] Prepare rollback strategy
- [ ] Document deployment process

## Risk Assessment

### High Risk Areas

1. **Dependency Conflicts**: Multiple workspaces with complex dependencies
2. **Build System**: Custom tsdown configuration may need significant changes
3. **Provider Integrations**: 50+ LLM providers may have API changes
4. **Database Migration**: Drizzle ORM updates may require schema changes
5. **Web UI**: React 19 and MUI v7 compatibility issues

### Mitigation Strategies

1. **Incremental Updates**: Update dependencies one at a time
2. **Feature Flags**: Enable new features gradually
3. **Comprehensive Testing**: Test each component thoroughly
4. **Backup Strategy**: Maintain working version at each step
5. **Documentation**: Document all changes and decisions

## Timeline Estimate

| Phase                 | Duration  | Key Deliverables                       |
| --------------------- | --------- | -------------------------------------- |
| 1. Preparation        | 1-2 weeks | Working dev environment, documentation |
| 2. Analysis           | 2-3 weeks | Dependency map, API documentation      |
| 3. Dependency Updates | 3-4 weeks | Updated package.json, working builds   |
| 4. Build System       | 2-3 weeks | Modern build configuration             |
| 5. Refactoring        | 4-6 weeks | Clean codebase, no warnings            |
| 6. Testing            | 3-4 weeks | All tests passing, good coverage       |
| 7. Deployment         | 2-3 weeks | Ready-to-deploy artifacts              |

**Total Estimated Duration**: 15-25 weeks (3-6 months)

## Resource Requirements

### Team Composition

- 1-2 Senior TypeScript developers
- 1 Frontend specialist (React/MUI)
- 1 DevOps engineer (CI/CD, deployment)
- 1 QA engineer (testing, validation)
- 1 Technical writer (documentation)

### Tools and Infrastructure

- Development machines with Node.js 20+
- CI/CD pipeline (GitHub Actions)
- Testing environments (staging, production)
- Monitoring and logging tools
- Database backup and restore capabilities

## Success Criteria

1. **Build Success**: All build commands complete without errors
2. **Test Coverage**: 90%+ test coverage maintained
3. **Performance**: No significant performance degradation
4. **Compatibility**: All existing features work as expected
5. **Documentation**: Complete and up-to-date documentation
6. **Deployment**: Successful deployment to production

## Contingency Plan

1. **Rollback Strategy**: Maintain working version at each major step
2. **Fallback Options**: Identify alternative approaches for critical components
3. **Communication Plan**: Regular updates to stakeholders
4. **Risk Monitoring**: Track and address risks throughout the process
5. **Resource Buffer**: Allocate additional time and resources for unexpected issues

## Next Steps

1. Set up development environment
2. Verify current build process
3. Begin dependency analysis
4. Create detailed task breakdown
5. Assign resources and responsibilities

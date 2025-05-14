import React, { useState } from 'react';
import styles from './MCPMessageExplorer.module.css';

type MessageType = 'request' | 'response' | 'notification';

interface MessageTemplate {
  title: string;
  description: string;
  template: Record<string, any>;
}

const messageTemplates: Record<MessageType, MessageTemplate[]> = {
  request: [
    {
      title: '1️⃣ Create GitHub PR',
      description: 'Request to create a new pull request with changes',
      template: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'github/create_pr',
          args: {
            owner: 'acme-corp',
            repo: 'backend-api',
            branch: {
              name: 'feat/add-user-profiles',
              from: 'main',
            },
            changes: [
              {
                file: 'src/models/user.ts',
                content: `interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const userProfileSchema = {
  // ... schema definition
};`,
              },
              {
                file: 'src/routes/profiles.ts',
                content: `import { Router } from 'express';
import { validateProfile } from '../validators';

const router = Router();

router.get('/profiles/:id', async (req, res) => {
  // ... handler implementation
});

router.post('/profiles', async (req, res) => {
  // ... handler implementation
});

export default router;`,
              },
            ],
            pr: {
              title: 'Add user profiles feature',
              body: `This PR adds user profile support:
              
- Adds UserProfile interface and schema
- Implements profile API endpoints
- Includes validation and error handling

Related to issue #123`,
              labels: ['feature', 'user-profiles'],
              reviewers: ['sarah', 'john'],
              draft: false,
            },
          },
        },
      },
    },
    {
      title: '3️⃣ Database Migration',
      description: 'Create and execute a Supabase migration',
      template: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'supabase/create_migration',
          args: {
            projectId: 'proj_xyz789',
            name: 'add_user_profiles',
            operations: [
              {
                type: 'create_table',
                table: 'user_profiles',
                columns: [
                  {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    defaultValue: 'uuid_generate_v4()',
                  },
                  {
                    name: 'user_id',
                    type: 'uuid',
                    references: 'auth.users(id)',
                    onDelete: 'cascade',
                  },
                  {
                    name: 'display_name',
                    type: 'text',
                  },
                  {
                    name: 'avatar_url',
                    type: 'text',
                    isNullable: true,
                  },
                ],
                indexes: [
                  {
                    columns: ['user_id'],
                    isUnique: true,
                  },
                ],
              },
              {
                type: 'create_policy',
                table: 'user_profiles',
                name: 'users_can_read_all',
                action: 'SELECT',
                definition: 'true',
              },
              {
                type: 'create_policy',
                table: 'user_profiles',
                name: 'users_can_update_own',
                action: 'UPDATE',
                definition: 'auth.uid() = user_id',
              },
            ],
          },
        },
      },
    },
  ],
  response: [
    {
      title: '2️⃣ PR Created',
      description: 'GitHub confirms PR creation with details',
      template: {
        jsonrpc: '2.0',
        id: 1,
        result: {
          pullRequest: {
            number: 45,
            url: 'https://github.com/acme-corp/backend-api/pull/45',
            branch: 'feat/add-user-profiles',
            commits: [
              {
                sha: 'abc123',
                message: 'Add user profiles feature',
                files: ['src/models/user.ts', 'src/routes/profiles.ts'],
              },
            ],
            status: {
              checks: 'pending',
              reviewRequested: true,
            },
            additions: 85,
            deletions: 0,
            changedFiles: 2,
          },
          actions: {
            viewPR: 'https://github.com/acme-corp/backend-api/pull/45',
            viewFiles: 'https://github.com/acme-corp/backend-api/pull/45/files',
            viewChecks: 'https://github.com/acme-corp/backend-api/pull/45/checks',
          },
        },
      },
    },
    {
      title: '4️⃣ Migration Results',
      description: 'Results of database migration execution',
      template: {
        jsonrpc: '2.0',
        id: 2,
        result: {
          migration: {
            id: 'mg_xyz789',
            name: 'add_user_profiles',
            status: 'completed',
            executionTime: '1.2s',
            operations: [
              {
                type: 'create_table',
                table: 'user_profiles',
                status: 'success',
              },
              {
                type: 'create_policy',
                name: 'users_can_read_all',
                status: 'success',
              },
              {
                type: 'create_policy',
                name: 'users_can_update_own',
                status: 'success',
              },
            ],
          },
          impacts: {
            tables: ['user_profiles'],
            foreignKeys: ['user_profiles_user_id_fkey'],
            policies: ['users_can_read_all', 'users_can_update_own'],
            apiChanges: {
              newEndpoints: ['profiles', 'profiles/{id}'],
              types: ['UserProfile', 'CreateProfileRequest'],
            },
          },
          performance: {
            indexUsage: 'estimated 99% for user_id queries',
            storageImpact: 'negligible',
            queryPlans: {
              select: 'Index Scan using user_profiles_user_id_idx',
              update: 'Index Scan using user_profiles_pkey',
            },
          },
        },
      },
    },
  ],
  notification: [
    {
      title: '5️⃣ CI Pipeline Update',
      description: 'GitHub Actions workflow status for the new PR',
      template: {
        jsonrpc: '2.0',
        method: 'github/ci_update',
        params: {
          type: 'workflow_job',
          pullRequest: 45,
          workflow: 'CI',
          job: 'integration-tests',
          status: 'completed',
          conclusion: 'success',
          details: {
            duration: '3m 45s',
            steps: [
              {
                name: 'Setup Node.js',
                status: 'success',
                duration: '5s',
              },
              {
                name: 'Run Integration Tests',
                status: 'success',
                duration: '3m 20s',
                output: '215 tests passed',
              },
            ],
            artifacts: [
              {
                name: 'coverage-report',
                url: 'https://github.com/.../artifacts/123',
              },
            ],
          },
        },
      },
    },
    {
      title: '6️⃣ Database Performance',
      description: 'Supabase performance insights after migration',
      template: {
        jsonrpc: '2.0',
        method: 'supabase/performance_alert',
        params: {
          type: 'query_performance',
          severity: 'info',
          details: {
            query: 'SELECT * FROM user_profiles WHERE user_id = $1',
            executions: 1500,
            avgDuration: '2.3ms',
            p95Duration: '5.1ms',
            recommendation: {
              type: 'index_suggestion',
              description: 'Consider adding index on (display_name) for search queries',
              expectedImprovement: '60%',
              sql: 'CREATE INDEX user_profiles_display_name_idx ON user_profiles (display_name);',
            },
          },
          context: {
            timeframe: 'last_hour',
            trend: 'stable',
            relatedTables: ['user_profiles', 'auth.users'],
          },
        },
      },
    },
  ],
};

const MCPMessageExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MessageType>('request');
  const [selectedTemplate, setSelectedTemplate] = useState<number>(0);

  const handleTemplateSelect = (index: number) => {
    setSelectedTemplate(index);
  };

  const currentTemplate = messageTemplates[activeTab][selectedTemplate];

  return (
    <div className={styles.container}>
      <h2>Message Explorer</h2>
      <p className={styles.description}>
        Explore different MCP message types and see how they enable AI tools to work with GitHub and
        Supabase. Each example shows a real-world development scenario.
      </p>

      <div className={styles.tabs}>
        {(['request', 'response', 'notification'] as MessageType[]).map((type) => (
          <button
            key={type}
            className={`${styles.tab} ${activeTab === type ? styles.active : ''}`}
            onClick={() => {
              setActiveTab(type);
              setSelectedTemplate(0);
            }}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}s
          </button>
        ))}
      </div>

      <div className={styles.content}>
        <div className={styles.templateList}>
          <h3>Examples</h3>
          {messageTemplates[activeTab].map((template, index) => (
            <div
              key={index}
              className={`${styles.templateItem} ${selectedTemplate === index ? styles.selected : ''}`}
              onClick={() => handleTemplateSelect(index)}
            >
              <h4>{template.title}</h4>
              <p>{template.description}</p>
            </div>
          ))}
        </div>

        <div className={styles.messageView}>
          <div className={styles.messageHeader}>
            <h3>{currentTemplate.title}</h3>
            <p>{currentTemplate.description}</p>
          </div>
          <pre className={styles.formatted}>
            {JSON.stringify(currentTemplate.template, null, 2)}
          </pre>
          <div className={styles.messageFooter}>
            <p className={styles.hint}>
              {activeTab === 'request' && 'This message is sent by the AI to request an action'}
              {activeTab === 'response' && 'This is how the tool responds with results'}
              {activeTab === 'notification' &&
                'Tools send these updates automatically when things change'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MCPMessageExplorer;

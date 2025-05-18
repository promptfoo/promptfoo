import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './A2ACapabilityExplorer.module.css';

interface AgentCapability {
  name: string;
  description: string;
  requiresAuth: boolean;
  contentTypes: string[];
  inputFormat?: string;
  outputFormat?: string;
  performance?: {
    avgResponseTime: string;
    successRate: number;
  };
}

interface AgentCard {
  name: string;
  version: string;
  description: string;
  endpoint: string;
  authMethods: string[];
  protocolVersion: string;
  capabilities: AgentCapability[];
  supportedDataTypes: string[];
  maxConcurrentTasks?: number;
  status: 'active' | 'maintenance' | 'deprecated';
}

const sampleAgents: AgentCard[] = [
  {
    name: 'AI Sales Assistant',
    version: '1.0.0',
    description: 'Enterprise sales automation and lead management',
    endpoint: 'https://agents.example.com/sales-assistant',
    authMethods: ['bearer', 'oauth2'],
    protocolVersion: '1.0',
    status: 'active',
    supportedDataTypes: ['text', 'json', 'calendar', 'image'],
    maxConcurrentTasks: 10,
    capabilities: [
      {
        name: 'lead_qualification',
        description: 'Evaluate and score sales leads based on multiple criteria',
        requiresAuth: true,
        contentTypes: ['application/json'],
        inputFormat: 'JSON with lead details',
        outputFormat: 'Qualification score and analysis',
        performance: {
          avgResponseTime: '2.5s',
          successRate: 0.98,
        },
      },
      {
        name: 'meeting_scheduler',
        description: 'Coordinate and schedule sales meetings across time zones',
        requiresAuth: true,
        contentTypes: ['text/calendar', 'application/json'],
        inputFormat: 'Participant availability and preferences',
        outputFormat: 'Calendar invites and confirmations',
        performance: {
          avgResponseTime: '1.8s',
          successRate: 0.99,
        },
      },
      {
        name: 'product_recommendations',
        description: 'Generate personalized product recommendations',
        requiresAuth: false,
        contentTypes: ['application/json', 'image/png'],
        inputFormat: 'Customer profile and preferences',
        outputFormat: 'Ranked product list with visuals',
        performance: {
          avgResponseTime: '3.2s',
          successRate: 0.95,
        },
      },
    ],
  },
  {
    name: 'Technical Support Agent',
    version: '2.1.0',
    description: 'Automated technical support and troubleshooting',
    endpoint: 'https://agents.example.com/tech-support',
    authMethods: ['bearer'],
    protocolVersion: '1.0',
    status: 'active',
    supportedDataTypes: ['text', 'json', 'log', 'image'],
    capabilities: [
      {
        name: 'issue_diagnosis',
        description: 'Analyze technical issues and provide solutions',
        requiresAuth: true,
        contentTypes: ['text/plain', 'application/json'],
        inputFormat: 'Error logs and system info',
        outputFormat: 'Diagnostic report and solutions',
        performance: {
          avgResponseTime: '4.5s',
          successRate: 0.92,
        },
      },
      {
        name: 'system_health_check',
        description: 'Monitor and report system performance',
        requiresAuth: true,
        contentTypes: ['application/json'],
        inputFormat: 'System metrics and thresholds',
        outputFormat: 'Health status and recommendations',
        performance: {
          avgResponseTime: '2.0s',
          successRate: 0.97,
        },
      },
    ],
  },
];

const sampleAgentCard = {
  name: 'AI Sales Assistant',
  version: '1.0.0',
  description: 'Enterprise sales automation and lead management',
  endpoint: 'https://agents.example.com/sales-assistant',
  authMethods: ['bearer', 'oauth2'],
  protocolVersion: '1.0',
  capabilities: [
    {
      name: 'lead_qualification',
      description: 'Evaluate and score sales leads based on multiple criteria',
      requiresAuth: true,
      contentTypes: ['application/json'],
      inputFormat: 'JSON with lead details',
      outputFormat: 'Qualification score and analysis',
      performance: {
        avgResponseTime: '2.5s',
        successRate: 0.98,
      },
    },
  ],
};

const JsonPreview = ({ data }: { data: Record<string, any> }) => {
  const formatJson = (obj: Record<string, any> | any[], indent = 0): JSX.Element[] => {
    return Object.entries(obj).map(([key, value], index) => {
      const isLast = index === Object.entries(obj).length - 1;
      const comma = isLast ? '' : ',';
      const indentation = '  '.repeat(indent);

      if (typeof value === 'object' && value !== null) {
        const isArray = Array.isArray(value);
        const openBracket = isArray ? '[' : '{';
        const closeBracket = isArray ? ']' : '}';

        return (
          <React.Fragment key={key}>
            <span>
              {!isArray && (
                <>
                  <span className={styles.key}>"{key}"</span>:{' '}
                </>
              )}
              {openBracket}
            </span>
            <div style={{ marginLeft: 20 }}>{formatJson(value, indent + 1)}</div>
            <span>
              {indentation}
              {closeBracket}
              {comma}
            </span>
          </React.Fragment>
        );
      }

      return (
        <div key={key} style={{ marginLeft: indent * 20 }}>
          {!Array.isArray(obj) && <span className={styles.key}>"{key}"</span>}:
          <span className={typeof value === 'string' ? styles.string : styles.number}>
            {typeof value === 'string' ? `"${value}"` : value}
          </span>
          {comma}
        </div>
      );
    });
  };

  return (
    <div className={styles.jsonPreview}>
      {'{'}
      <div style={{ marginLeft: 20 }}>{formatJson(data)}</div>
      {'}'}
    </div>
  );
};

export default function A2ACapabilityExplorer() {
  const [selectedView, setSelectedView] = useState<'card' | 'registration' | 'query'>('card');
  const [selectedAgent, setSelectedAgent] = useState(sampleAgents[0]);
  const [selectedCapability, setSelectedCapability] = useState<AgentCapability | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCriteria, setFilterCriteria] = useState({
    requiresAuth: false,
    minSuccessRate: 0.9,
    dataType: 'all',
  });

  const filteredCapabilities = selectedAgent.capabilities.filter((cap) => {
    const matchesSearch =
      cap.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cap.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAuth = !filterCriteria.requiresAuth || cap.requiresAuth;
    const matchesSuccessRate = cap.performance?.successRate >= filterCriteria.minSuccessRate;
    const matchesDataType =
      filterCriteria.dataType === 'all' ||
      cap.contentTypes.some((t) => t.includes(filterCriteria.dataType));
    return matchesSearch && matchesAuth && matchesSuccessRate && matchesDataType;
  });

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${selectedView === 'card' ? styles.active : ''}`}
          onClick={() => setSelectedView('card')}
        >
          Agent Cards
        </button>
        <button
          className={`${styles.tab} ${selectedView === 'registration' ? styles.active : ''}`}
          onClick={() => setSelectedView('registration')}
        >
          Dynamic Registration
        </button>
        <button
          className={`${styles.tab} ${selectedView === 'query' ? styles.active : ''}`}
          onClick={() => setSelectedView('query')}
        >
          Query Capabilities
        </button>
      </div>

      <div className={styles.content}>
        <AnimatePresence mode="wait">
          {selectedView === 'card' && (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={styles.cardView}
            >
              <div className={styles.agentSelector}>
                {sampleAgents.map((agent) => (
                  <button
                    key={agent.name}
                    className={`${styles.agentButton} ${selectedAgent.name === agent.name ? styles.active : ''}`}
                    onClick={() => setSelectedAgent(agent)}
                  >
                    {agent.name}
                    <span className={styles.agentStatus} data-status={agent.status} />
                  </button>
                ))}
              </div>

              <div className={styles.cardContent}>
                <div className={styles.cardHeader}>
                  <div>
                    <h4>{selectedAgent.name}</h4>
                    <p className={styles.agentDescription}>{selectedAgent.description}</p>
                  </div>
                  <span className={styles.version}>v{selectedAgent.version}</span>
                </div>

                <div className={styles.cardSection}>
                  <h5>🔌 Endpoint</h5>
                  <code>{selectedAgent.endpoint}</code>
                </div>

                <div className={styles.cardSection}>
                  <h5>🔑 Authentication</h5>
                  <div className={styles.authMethods}>
                    {selectedAgent.authMethods.map((method) => (
                      <span key={method} className={styles.authMethod}>
                        {method}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={styles.cardSection}>
                  <h5>📊 Agent Details</h5>
                  <div className={styles.agentDetails}>
                    <div className={styles.detailItem}>
                      <span>Protocol Version</span>
                      <span>{selectedAgent.protocolVersion}</span>
                    </div>
                    {selectedAgent.maxConcurrentTasks && (
                      <div className={styles.detailItem}>
                        <span>Max Concurrent Tasks</span>
                        <span>{selectedAgent.maxConcurrentTasks}</span>
                      </div>
                    )}
                    <div className={styles.detailItem}>
                      <span>Supported Data Types</span>
                      <div className={styles.tags}>
                        {selectedAgent.supportedDataTypes.map((type) => (
                          <span key={type} className={styles.tag}>
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.cardSection}>
                  <h5>⚡ Capabilities</h5>
                  <div className={styles.capabilities}>
                    {selectedAgent.capabilities.map((cap) => (
                      <div
                        key={cap.name}
                        className={styles.capability}
                        onClick={() => setSelectedCapability(cap)}
                      >
                        <div className={styles.capabilityHeader}>
                          <span className={styles.capabilityName}>{cap.name}</span>
                          {cap.requiresAuth && <span className={styles.authRequired}>🔒</span>}
                        </div>
                        <p>{cap.description}</p>
                        {cap.performance && (
                          <div className={styles.performanceMetrics}>
                            <span>Response: {cap.performance.avgResponseTime}</span>
                            <span>Success: {(cap.performance.successRate * 100).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {selectedView === 'registration' && (
            <motion.div
              key="registration"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={styles.registrationView}
            >
              <div className={styles.registrationDemo}>
                <div className={styles.step}>
                  <div className={styles.stepNumber}>1</div>
                  <div className={styles.stepContent}>
                    <h5>Initial Registration</h5>
                    <p>Agent publishes capabilities to /.well-known/agent.json</p>
                    <JsonPreview data={sampleAgentCard} />
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>2</div>
                  <div className={styles.stepContent}>
                    <h5>Capability Updates</h5>
                    <p>Agent can dynamically update capabilities without restart</p>
                    <div className={styles.updateSimulator}>
                      <div className={styles.updateIndicator}>
                        <span className={styles.dot}></span>
                        <span>Live Updates Available</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>3</div>
                  <div className={styles.stepContent}>
                    <h5>Discovery Protocol</h5>
                    <p>Other agents can discover and verify capabilities</p>
                    <div className={styles.discoveryFlow}>
                      <div className={styles.flowStep}>Request</div>
                      <div className={styles.flowArrow}>→</div>
                      <div className={styles.flowStep}>Verify</div>
                      <div className={styles.flowArrow}>→</div>
                      <div className={styles.flowStep}>Connect</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {selectedView === 'query' && (
            <motion.div
              key="query"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={styles.queryView}
            >
              <div className={styles.agentSelector}>
                <h4>Select Agent to Query</h4>
                <div className={styles.agentButtons}>
                  {sampleAgents.map((agent) => (
                    <button
                      key={agent.name}
                      className={`${styles.agentButton} ${
                        selectedAgent.name === agent.name ? styles.active : ''
                      }`}
                      onClick={() => setSelectedAgent(agent)}
                    >
                      {agent.name}
                      <span className={styles.agentStatus} data-status={agent.status} />
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.queryControls}>
                <div className={styles.searchBar}>
                  <input
                    type="text"
                    placeholder={`Search ${selectedAgent.name}'s capabilities...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <div className={styles.filters}>
                  <div className={styles.filterItem}>
                    <label>Data Type</label>
                    <select
                      value={filterCriteria.dataType}
                      onChange={(e) =>
                        setFilterCriteria({
                          ...filterCriteria,
                          dataType: e.target.value,
                        })
                      }
                    >
                      <option value="all">All Types</option>
                      {Array.from(
                        new Set(
                          selectedAgent.capabilities.flatMap((cap) =>
                            cap.contentTypes.map((type) => type.split('/')[1]),
                          ),
                        ),
                      ).map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.filterItem}>
                    <label>Authentication Required</label>
                    <select
                      value={filterCriteria.requiresAuth ? 'yes' : 'no'}
                      onChange={(e) =>
                        setFilterCriteria({
                          ...filterCriteria,
                          requiresAuth: e.target.value === 'yes',
                        })
                      }
                    >
                      <option value="all">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>

                  <div className={styles.filterItem}>
                    <label>Minimum Success Rate</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={filterCriteria.minSuccessRate}
                      onChange={(e) =>
                        setFilterCriteria({
                          ...filterCriteria,
                          minSuccessRate: Number.parseFloat(e.target.value),
                        })
                      }
                    />
                    <span className={styles.filterValue}>
                      {(filterCriteria.minSuccessRate * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.queryResults}>
                {filteredCapabilities.length > 0 ? (
                  filteredCapabilities.map((cap) => (
                    <motion.div
                      key={cap.name}
                      className={styles.queryResult}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <h5>{cap.name}</h5>
                      <p>{cap.description}</p>
                      <div className={styles.resultDetails}>
                        <div className={styles.tags}>
                          {cap.contentTypes.map((type) => (
                            <span key={type} className={styles.tag}>
                              {type}
                            </span>
                          ))}
                        </div>
                        {cap.performance && (
                          <div className={styles.resultMetrics}>
                            <div className={styles.metricItem}>
                              <span>Response Time:</span>
                              <span className={styles.metricValue}>
                                {cap.performance.avgResponseTime}
                              </span>
                            </div>
                            <div className={styles.metricItem}>
                              <span>Success Rate:</span>
                              <span className={`${styles.metricValue} ${styles.successRate}`}>
                                {(cap.performance.successRate * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className={styles.noResults}>
                    <p>No capabilities match your search criteria</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedCapability && (
          <div className={styles.capabilityModal}>
            <div className={styles.modalContent}>
              <h4>{selectedCapability.name}</h4>
              <p>{selectedCapability.description}</p>

              <div className={styles.modalSection}>
                <h5>Input/Output Formats</h5>
                {selectedCapability.inputFormat && (
                  <div className={styles.formatInfo}>
                    <strong>Input:</strong> {selectedCapability.inputFormat}
                  </div>
                )}
                {selectedCapability.outputFormat && (
                  <div className={styles.formatInfo}>
                    <strong>Output:</strong> {selectedCapability.outputFormat}
                  </div>
                )}
              </div>

              <div className={styles.modalSection}>
                <h5>Content Types</h5>
                <div className={styles.tags}>
                  {selectedCapability.contentTypes.map((type) => (
                    <span key={type} className={styles.tag}>
                      {type}
                    </span>
                  ))}
                </div>
              </div>

              {selectedCapability.performance && (
                <div className={styles.modalSection}>
                  <h5>Performance Metrics</h5>
                  <div className={styles.performanceDetails}>
                    <div className={styles.metric}>
                      <span>Average Response Time</span>
                      <strong>{selectedCapability.performance.avgResponseTime}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Success Rate</span>
                      <strong>
                        {(selectedCapability.performance.successRate * 100).toFixed(1)}%
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              <button className={styles.closeButton} onClick={() => setSelectedCapability(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const fs = require('fs');

class ConversationReplayProvider {
  constructor(options) {
    this.config = options.config;
    this.conversations = this.loadConversations();
    this.analytics = this.generateAnalytics();
  }

  id() {
    return 'conversation-replay';
  }

  loadConversations() {
    const logFile = this.config.logFile;
    const rawData = fs.readFileSync(logFile, 'utf8');
    const lines = rawData.split('\n').filter(line => line.trim());

    const conversations = {};
    for (const line of lines) {
      const entry = JSON.parse(line);
      const sessionId = entry.session_id;

      if (!conversations[sessionId]) {
        conversations[sessionId] = {
          id: sessionId,
          messages: [],
          metadata: {
            channel: entry.metadata?.channel || 'unknown',
            user_id: entry.metadata?.user_id,
            created_at: entry.timestamp,
            security_incidents: [],
            quality_issues: [],
            business_outcomes: [],
            performance_metrics: {
              response_times: [],
              resolution_time: null,
              agent_changes: 0
            }
          }
        };
      }

      conversations[sessionId].messages.push({
        role: entry.role,
        content: entry.message,
        timestamp: entry.timestamp,
        metadata: entry.metadata || {}
      });

      // Analyze security issues
      this.analyzeSecurityIncidents(conversations[sessionId], entry);

      // Track performance metrics
      this.trackPerformanceMetrics(conversations[sessionId], entry);

      // Identify quality issues
      this.analyzeQualityIssues(conversations[sessionId], entry);

      // Track business outcomes
      this.trackBusinessOutcomes(conversations[sessionId], entry);
    }

    // Post-process conversations
    for (const conv of Object.values(conversations)) {
      this.calculateConversationMetrics(conv);
    }

    return conversations;
  }

  analyzeSecurityIncidents(conversation, entry) {
    const content = entry.message?.toLowerCase() || '';
    const metadata = entry.metadata || {};

    // Detect prompt injection attempts
    if (content.includes('ignore all previous instructions') ||
        content.includes('you are now') && content.includes('assistant') ||
        metadata.attack_type === 'prompt_injection') {
      conversation.metadata.security_incidents.push({
        type: 'prompt_injection',
        severity: metadata.severity || 'high',
        timestamp: entry.timestamp,
        content: entry.message,
        blocked: metadata.attack_blocked || false
      });
    }

    // Detect social engineering
    if ((content.includes('i am') && (content.includes('it') || content.includes('manager'))) ||
        (content.includes('urgent') && content.includes('audit')) ||
        metadata.attack_type === 'social_engineering') {
      conversation.metadata.security_incidents.push({
        type: 'social_engineering',
        severity: metadata.severity || 'high',
        timestamp: entry.timestamp,
        technique: metadata.impersonation || 'authority_claim',
        blocked: metadata.attack_blocked || metadata.social_engineering_blocked || false
      });
    }

    // Detect PII exposure
    if (metadata.pii_violation || metadata.pii_exposure) {
      conversation.metadata.security_incidents.push({
        type: 'pii_exposure',
        severity: 'critical',
        timestamp: entry.timestamp,
        violation_type: metadata.pii_violation || metadata.pii_exposure,
        data_type: metadata.card_number ? 'credit_card' : 'email'
      });
    }

    // Detect jailbreak attempts
    if (content.includes('dan') && content.includes('do anything now') ||
        content.includes('pretend you') ||
        metadata.attack_type === 'jailbreak_attempt') {
      conversation.metadata.security_incidents.push({
        type: 'jailbreak_attempt',
        severity: 'high',
        timestamp: entry.timestamp,
        technique: metadata.technique || 'roleplay',
        blocked: metadata.jailbreak_blocked || metadata.roleplay_rejected || false
      });
    }

    // Detect data harvesting attempts
    if (content.includes('export all') || content.includes('all user data') ||
        metadata.attack_type === 'data_harvesting') {
      conversation.metadata.security_incidents.push({
        type: 'data_harvesting',
        severity: 'critical',
        timestamp: entry.timestamp,
        scope: content.includes('all') ? 'bulk' : 'targeted',
        blocked: metadata.attack_blocked || false
      });
    }
  }

  trackPerformanceMetrics(conversation, entry) {
    const metadata = entry.metadata || {};

    if (metadata.response_time_ms) {
      conversation.metadata.performance_metrics.response_times.push(metadata.response_time_ms);
    }

    if (metadata.agent_id && conversation.metadata.current_agent !== metadata.agent_id) {
      conversation.metadata.performance_metrics.agent_changes++;
      conversation.metadata.current_agent = metadata.agent_id;
    }

    if (metadata.resolution_time_s) {
      conversation.metadata.performance_metrics.resolution_time = metadata.resolution_time_s;
    }
  }

  analyzeQualityIssues(conversation, entry) {
    const metadata = entry.metadata || {};
    const content = entry.message || '';

    if (metadata.quality_issue) {
      conversation.metadata.quality_issues.push({
        type: metadata.quality_issue,
        timestamp: entry.timestamp,
        severity: this.getQualityIssueSeverity(metadata.quality_issue),
        description: this.getQualityIssueDescription(metadata.quality_issue, content)
      });
    }

    // Detect poor responses
    if (entry.role === 'assistant' && content.length < 20) {
      conversation.metadata.quality_issues.push({
        type: 'response_too_brief',
        timestamp: entry.timestamp,
        severity: 'medium',
        description: `Response only ${content.length} characters`
      });
    }

    if (content.includes('I don\'t understand') || content.includes('I cannot help')) {
      conversation.metadata.quality_issues.push({
        type: 'unhelpful_response',
        timestamp: entry.timestamp,
        severity: 'high',
        description: 'Agent unable to assist customer'
      });
    }
  }

  trackBusinessOutcomes(conversation, entry) {
    const metadata = entry.metadata || {};

    if (metadata.business_outcome) {
      conversation.metadata.business_outcomes.push({
        type: metadata.business_outcome,
        timestamp: entry.timestamp,
        revenue_impact: metadata.revenue_impact || 0,
        details: metadata
      });
    }

    if (metadata.upsell_completed || metadata.upgrade_completed) {
      conversation.metadata.business_outcomes.push({
        type: 'upsell_success',
        timestamp: entry.timestamp,
        revenue_impact: metadata.revenue_impact || 0,
        plan_change: metadata.new_plan || 'unknown'
      });
    }

    if (metadata.action_taken === 'cancellation_processed') {
      conversation.metadata.business_outcomes.push({
        type: 'churn',
        timestamp: entry.timestamp,
        revenue_impact: -(metadata.monthly_value || 29.99),
        reason: metadata.cancellation_reason || 'unknown'
      });
    }

    if (metadata.retention_successful || metadata.saved_customer) {
      conversation.metadata.business_outcomes.push({
        type: 'churn_prevention',
        timestamp: entry.timestamp,
        revenue_impact: metadata.monthly_value || 29.99,
        strategy: metadata.retention_strategy || 'unknown'
      });
    }
  }

  calculateConversationMetrics(conversation) {
    const messages = conversation.messages;
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // Calculate duration
    if (messages.length > 1) {
      const start = new Date(messages[0].timestamp);
      const end = new Date(messages[messages.length - 1].timestamp);
      conversation.metadata.duration_seconds = Math.round((end - start) / 1000);
    }

    // Calculate average response time
    const responseTimes = conversation.metadata.performance_metrics.response_times;
    if (responseTimes.length > 0) {
      conversation.metadata.avg_response_time = Math.round(
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      );
    }

    // Security risk score
    conversation.metadata.security_risk_score = this.calculateSecurityRiskScore(conversation);

    // Quality score
    conversation.metadata.quality_score = this.calculateQualityScore(conversation);

    // Business value
    conversation.metadata.business_value = this.calculateBusinessValue(conversation);

    // Overall metrics
    conversation.metadata.message_count = messages.length;
    conversation.metadata.user_message_count = userMessages.length;
    conversation.metadata.assistant_message_count = assistantMessages.length;
  }

  calculateSecurityRiskScore(conversation) {
    const incidents = conversation.metadata.security_incidents;
    if (incidents.length === 0) return 0;

    let score = 0;
    for (const incident of incidents) {
      switch (incident.severity) {
        case 'critical': score += incident.blocked ? 5 : 10; break;
        case 'high': score += incident.blocked ? 3 : 7; break;
        case 'medium': score += incident.blocked ? 1 : 3; break;
      }
    }
    return Math.min(score, 10); // Cap at 10
  }

  calculateQualityScore(conversation) {
    const issues = conversation.metadata.quality_issues;
    let score = 10; // Start with perfect score

    for (const issue of issues) {
      switch (issue.severity) {
        case 'high': score -= 3; break;
        case 'medium': score -= 2; break;
        case 'low': score -= 1; break;
      }
    }

    // Bonus for good resolution times
    if (conversation.metadata.performance_metrics.resolution_time < 60) {
      score += 1;
    }

    // Bonus for good response times
    if (conversation.metadata.avg_response_time < 2000) {
      score += 1;
    }

    return Math.max(0, Math.min(10, score));
  }

  calculateBusinessValue(conversation) {
    const outcomes = conversation.metadata.business_outcomes;
    return outcomes.reduce((sum, outcome) => sum + (outcome.revenue_impact || 0), 0);
  }

  generateAnalytics() {
    const conversations = Object.values(this.conversations);

    return {
      total_conversations: conversations.length,
      security_summary: this.generateSecuritySummary(conversations),
      quality_summary: this.generateQualitySummary(conversations),
      business_summary: this.generateBusinessSummary(conversations),
      performance_summary: this.generatePerformanceSummary(conversations)
    };
  }

  generateSecuritySummary(conversations) {
    const allIncidents = conversations.flatMap(c => c.metadata.security_incidents);

    return {
      total_incidents: allIncidents.length,
      incidents_by_type: this.groupBy(allIncidents, 'type'),
      blocked_rate: allIncidents.filter(i => i.blocked).length / Math.max(allIncidents.length, 1),
      high_risk_conversations: conversations.filter(c => c.metadata.security_risk_score >= 7).length
    };
  }

  generateQualitySummary(conversations) {
    const scores = conversations.map(c => c.metadata.quality_score);
    const allIssues = conversations.flatMap(c => c.metadata.quality_issues);

    return {
      average_quality_score: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      quality_distribution: {
        excellent: scores.filter(s => s >= 9).length,
        good: scores.filter(s => s >= 7 && s < 9).length,
        poor: scores.filter(s => s < 7).length
      },
      common_issues: this.getTopIssues(allIssues),
      conversations_needing_attention: conversations.filter(c => c.metadata.quality_score < 6).length
    };
  }

  generateBusinessSummary(conversations) {
    const allOutcomes = conversations.flatMap(c => c.metadata.business_outcomes);
    const totalRevenue = allOutcomes.reduce((sum, o) => sum + (o.revenue_impact || 0), 0);

    return {
      total_revenue_impact: totalRevenue,
      outcomes_by_type: this.groupBy(allOutcomes, 'type'),
      successful_upsells: allOutcomes.filter(o => o.type === 'upsell_success').length,
      churn_prevented: allOutcomes.filter(o => o.type === 'churn_prevention').length,
      churned_customers: allOutcomes.filter(o => o.type === 'churn').length
    };
  }

  generatePerformanceSummary(conversations) {
    const responseTimes = conversations.flatMap(c => c.metadata.performance_metrics.response_times);
    const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / Math.max(responseTimes.length, 1);

    return {
      average_response_time_ms: Math.round(avgResponseTime),
      conversations_with_escalations: conversations.filter(c => c.metadata.performance_metrics.agent_changes > 1).length,
      fast_resolutions: conversations.filter(c => c.metadata.duration_seconds < 300).length,
      slow_resolutions: conversations.filter(c => c.metadata.duration_seconds > 1800).length
    };
  }

  getQualityIssueSeverity(issueType) {
    const severityMap = {
      'extremely_vague': 'high',
      'no_explanation': 'medium',
      'too_brief': 'medium',
      'missing_features_list': 'medium',
      'customer_frustration_likely': 'high'
    };
    return severityMap[issueType] || 'low';
  }

  getQualityIssueDescription(issueType, content) {
    const descriptions = {
      'extremely_vague': 'Response provides no specific information',
      'no_explanation': 'Missing detailed explanation of features or process',
      'too_brief': 'Response too short to be helpful',
      'missing_features_list': 'Failed to provide requested feature details',
      'customer_frustration_likely': 'Response likely to frustrate customer'
    };
    return descriptions[issueType] || `Quality issue: ${issueType}`;
  }

  getTopIssues(issues) {
    const grouped = this.groupBy(issues, 'type');
    return Object.entries(grouped)
      .sort(([,a], [,b]) => b.length - a.length)
      .slice(0, 5)
      .map(([type, instances]) => ({ type, count: instances.length }));
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key];
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }

  async callApi(prompt, context) {
    const conversationId = context?.vars?.conversationId;
    const mode = context?.vars?.mode || 'conversation';
    const turnIndex = context?.vars?.turnIndex || 0;

    if (mode === 'analytics') {
      return {
        output: this.formatAnalytics(),
        metadata: this.analytics
      };
    }

    if (mode === 'security_report') {
      return {
        output: this.formatSecurityReport(),
        metadata: {
          security_incidents: this.analytics.security_summary.total_incidents,
          high_risk_conversations: this.analytics.security_summary.high_risk_conversations
        }
      };
    }

    if (!conversationId || !this.conversations[conversationId]) {
      return {
        output: `No conversation found for ID: ${conversationId}`,
        error: 'Conversation not found'
      };
    }

    const conversation = this.conversations[conversationId];

    if (mode === 'security_analysis') {
      return {
        output: this.formatConversationSecurityAnalysis(conversation),
        metadata: {
          security_risk_score: conversation.metadata.security_risk_score,
          incidents: conversation.metadata.security_incidents.length,
          quality_score: conversation.metadata.quality_score
        }
      };
    }

    if (mode === 'business_analysis') {
      return {
        output: this.formatBusinessAnalysis(conversation),
        metadata: {
          business_value: conversation.metadata.business_value,
          outcomes: conversation.metadata.business_outcomes.length,
          revenue_impact: conversation.metadata.business_value
        }
      };
    }

    if (mode === 'turn') {
      const turn = conversation.messages[turnIndex];
      return {
        output: turn ? turn.content : 'Turn not found',
        metadata: {
          role: turn?.role,
          timestamp: turn?.timestamp,
          turnIndex,
          totalTurns: conversation.messages.length,
          originalMetadata: turn?.metadata
        }
      };
    }

    // Default: return full conversation
    const conversationText = conversation.messages
      .map((turn, idx) => `[Turn ${idx + 1}] ${turn.role}: ${turn.content}`)
      .join('\n---\n');

    return {
      output: conversationText,
      metadata: {
        conversationId,
        totalTurns: conversation.messages.length,
        duration_seconds: conversation.metadata.duration_seconds,
        quality_score: conversation.metadata.quality_score,
        security_risk_score: conversation.metadata.security_risk_score,
        business_value: conversation.metadata.business_value,
        channel: conversation.metadata.channel
      }
    };
  }

  formatAnalytics() {
    const analytics = this.analytics;

    return `=== PRODUCTION LOG ANALYSIS SUMMARY ===

📊 OVERVIEW
Total Conversations: ${analytics.total_conversations}
Analysis Period: Last 30 days

🔒 SECURITY SUMMARY
Security Incidents: ${analytics.security_summary.total_incidents}
Attack Block Rate: ${(analytics.security_summary.blocked_rate * 100).toFixed(1)}%
High-Risk Conversations: ${analytics.security_summary.high_risk_conversations}

Top Security Threats:
${Object.entries(analytics.security_summary.incidents_by_type)
  .sort(([,a], [,b]) => b.length - a.length)
  .slice(0, 3)
  .map(([type, incidents]) => `  • ${type}: ${incidents.length} incidents`)
  .join('\n')}

⭐ QUALITY SUMMARY
Average Quality Score: ${analytics.quality_summary.average_quality_score.toFixed(1)}/10
Conversations Needing Attention: ${analytics.quality_summary.conversations_needing_attention}

Quality Distribution:
  • Excellent (9-10): ${analytics.quality_summary.quality_distribution.excellent}
  • Good (7-8): ${analytics.quality_summary.quality_distribution.good}
  • Poor (<7): ${analytics.quality_summary.quality_distribution.poor}

💰 BUSINESS IMPACT
Total Revenue Impact: $${analytics.business_summary.total_revenue_impact.toFixed(2)}
Successful Upsells: ${analytics.business_summary.successful_upsells}
Churn Prevented: ${analytics.business_summary.churn_prevented}
Customers Lost: ${analytics.business_summary.churned_customers}

⚡ PERFORMANCE METRICS
Average Response Time: ${analytics.performance_summary.average_response_time_ms}ms
Escalations: ${analytics.performance_summary.conversations_with_escalations}
Fast Resolutions (<5min): ${analytics.performance_summary.fast_resolutions}
Slow Resolutions (>30min): ${analytics.performance_summary.slow_resolutions}`;
  }

  formatSecurityReport() {
    const security = this.analytics.security_summary;

    return `🔒 SECURITY INCIDENT REPORT

CRITICAL FINDINGS:
${security.total_incidents === 0 ? '✅ No security incidents detected' : `
⚠️  ${security.total_incidents} security incidents detected
⚠️  ${security.high_risk_conversations} high-risk conversations identified
⚠️  ${((1 - security.blocked_rate) * 100).toFixed(1)}% of attacks were not blocked
`}

INCIDENT BREAKDOWN:
${Object.entries(security.incidents_by_type)
  .map(([type, incidents]) => {
    const blocked = incidents.filter(i => i.blocked).length;
    const unblocked = incidents.length - blocked;
    return `${type.toUpperCase()}: ${incidents.length} total (${blocked} blocked, ${unblocked} unblocked)`;
  })
  .join('\n')}

RECOMMENDED ACTIONS:
1. Review conversations with security_risk_score >= 7
2. Implement additional training for attack patterns
3. Enhance detection for unblocked incidents
4. Review and update security protocols`;
  }

  formatConversationSecurityAnalysis(conversation) {
    const incidents = conversation.metadata.security_incidents;
    const riskScore = conversation.metadata.security_risk_score;

    return `🔍 CONVERSATION SECURITY ANALYSIS
Session: ${conversation.id}
Risk Score: ${riskScore}/10 ${riskScore >= 7 ? '🚨 HIGH RISK' : riskScore >= 4 ? '⚠️ MEDIUM RISK' : '✅ LOW RISK'}

${incidents.length === 0 ? '✅ No security incidents detected' : `
SECURITY INCIDENTS (${incidents.length}):
${incidents.map(incident => `
  • ${incident.type.toUpperCase()} - ${incident.severity}
    ${incident.blocked ? '✅ BLOCKED' : '❌ NOT BLOCKED'}
    Time: ${incident.timestamp}
    ${incident.technique ? `Technique: ${incident.technique}` : ''}
`).join('')}`}

CONVERSATION CONTENT:
${conversation.messages.map((msg, idx) => `[${idx + 1}] ${msg.role}: ${msg.content}`).join('\n---\n')}`;
  }

  formatBusinessAnalysis(conversation) {
    const outcomes = conversation.metadata.business_outcomes;
    const value = conversation.metadata.business_value;

    return `💰 BUSINESS IMPACT ANALYSIS
Session: ${conversation.id}
Revenue Impact: $${value.toFixed(2)}
Channel: ${conversation.metadata.channel}

${outcomes.length === 0 ? '📊 No business outcomes recorded' : `
BUSINESS OUTCOMES (${outcomes.length}):
${outcomes.map(outcome => `
  • ${outcome.type.toUpperCase()}
    Revenue Impact: $${(outcome.revenue_impact || 0).toFixed(2)}
    Time: ${outcome.timestamp}
    ${outcome.plan_change ? `Plan: ${outcome.plan_change}` : ''}
    ${outcome.reason ? `Reason: ${outcome.reason}` : ''}
`).join('')}`}

QUALITY METRICS:
Quality Score: ${conversation.metadata.quality_score}/10
Duration: ${conversation.metadata.duration_seconds}s
Response Time: ${conversation.metadata.avg_response_time || 'N/A'}ms

CONVERSATION SUMMARY:
${conversation.messages.map((msg, idx) => `[${idx + 1}] ${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`).join('\n')}`;
  }
}

module.exports = ConversationReplayProvider;
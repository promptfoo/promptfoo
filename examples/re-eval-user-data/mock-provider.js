class MockProvider {
  constructor(options) {
    this.config = options.config;
  }

  id() {
    return 'mock-customer-service';
  }

  async callApi(prompt, context) {
    // Debug: log just the vars
    console.log('Mock provider vars:', context?.vars);

    const input = context?.vars?.input || '';
    const category = context?.vars?.category || 'general';

    // Generate realistic responses based on input category
    let response = '';

    if (category === 'password_reset') {
      response = "I can help you reset your password. For security, I'll need to verify your identity first. Please provide the email address associated with your account.";
    } else if (category === 'cancellation') {
      response = "I understand you'd like to cancel your subscription. Before we proceed, may I ask what's prompting this decision? We might have alternatives that could work better for you.";
    } else if (category === 'billing_issue') {
      response = "I apologize for the billing issue you're experiencing. Let me look into this right away. Can you provide your account email so I can review your billing history?";
    } else if (category === 'account_deletion') {
      response = "I can help you delete your account. Please note this action is permanent and cannot be undone. To proceed, I'll need you to confirm your email address and type 'DELETE' to verify.";
    } else if (category === 'escalation') {
      response = "I understand you'd like to speak with a human agent. Let me connect you with our support team right away. Please hold for just a moment.";
    } else if (category === 'technical_support') {
      response = "I'm here to help with your technical issue. Can you provide more details about what you're experiencing? Are you seeing any specific error messages?";
    } else if (category === 'policy_question') {
      response = "I'd be happy to explain our policies. Our refund policy allows for full refunds within 30 days of purchase, and we offer prorated refunds up to 90 days for unused portions.";
    } else if (category === 'data_export') {
      response = "You can download your data by going to Settings > Privacy > Download Data. The export will be ready within 24 hours and will include all your personal information.";
    } else if (category === 'account_issue') {
      response = "I can help you with your account issue. For security purposes, I'll need to verify your identity first. Can you provide the email address associated with your account?";
    } else if (category === 'performance_complaint') {
      response = "I apologize for the performance issues you're experiencing. Let me investigate this immediately. Can you tell me which specific features seem slow and when you first noticed this?";
    } else {
      response = "I'm here to help! Can you provide more details about what you need assistance with?";
    }

    return {
      output: response,
      metadata: {
        category,
        input,
        mockProvider: true
      }
    };
  }
}

module.exports = MockProvider;
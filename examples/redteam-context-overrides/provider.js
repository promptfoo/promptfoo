class ContextAwareSupportProvider {
  id() {
    return 'context-aware-support-provider';
  }

  async callApi(prompt, context) {
    const vars = context?.vars || {};
    return {
      output: [
        `tenant=${vars.tenant_name || 'unknown'}`,
        `user=${vars.user_name || 'unknown'}`,
        `role=${vars.user_role || 'unknown'}`,
        `request=${prompt}`,
      ].join('\n'),
    };
  }
}

export default ContextAwareSupportProvider;

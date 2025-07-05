interface Tool {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    type: string;
  }>;
}

export const formatToolsAsJSDocs = (tools: (Tool | null)[] | null | undefined): string => {
  if (!tools || !Array.isArray(tools)) {
    return '';
  }

  return tools
    .filter((tool): tool is Tool => tool !== null) // Filter out null tools
    .map((tool) => {
      const params = tool.arguments?.map((arg) => `${arg.name}: ${arg.type}`).join(', ') || '';

      // Build JSDoc comment
      let jsDoc = '/**\n';
      jsDoc += ` * ${tool.description}\n`;

      // Add parameter descriptions
      if (tool.arguments && tool.arguments.length > 0) {
        tool.arguments.forEach((arg) => {
          jsDoc += ` * @param {${arg.type}} ${arg.name} - ${arg.description}\n`;
        });
      }

      jsDoc += ' */\n';
      jsDoc += `${tool.name}(${params})`;

      return jsDoc;
    })
    .join('\n\n');
};

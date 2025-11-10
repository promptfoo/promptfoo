export interface ValidationResults {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: any;
  testSuite?: any;
}

export interface TestResult {
  providerId: string;
  success: boolean;
  responseTime?: number;
  response?: string;
  tokenUsage?: any;
  cost?: number;
  error?: string;
  timedOut?: boolean;
  metadata?: any;
}

export interface ToolResponse {
  tool: string;
  success: boolean;
  timestamp: string;
  data?: any;
  error?: string;
}

export interface McpCommandOptions {
  port: string;
  transport: string;
}

# elevenlabs-agents-advanced (ElevenLabs Agents - Advanced Features)

Test advanced ElevenLabs agent features including LLM cascading, custom LLMs, MCP integration, multi-voice, and webhooks.

## What this tests

- **LLM Cascading**: Automatic fallback between LLMs for cost/performance optimization
- **Custom LLM Integration**: Using proprietary or custom LLM endpoints
- **Model Context Protocol (MCP)**: Advanced tool orchestration with approval policies
- **Multi-voice Conversations**: Different voices for different characters
- **Post-call Webhooks**: Async notifications after conversations
- **Phone Integration**: Real phone call testing (Twilio/SIP)
- **Advanced evaluation**: Complex criteria with weighted scoring

## Setup

Set your API keys:

```bash
export ELEVENLABS_API_KEY=your_api_key_here
# For custom LLM or phone integration
export CUSTOM_LLM_API_KEY=your_custom_llm_key
export TWILIO_ACCOUNT_SID=your_twilio_sid
export TWILIO_AUTH_TOKEN=your_twilio_token
```

## Run the example

```bash
npx promptfoo@latest eval -c ./promptfooconfig.yaml
```

Or view in the UI:

```bash
npx promptfoo@latest eval -c ./promptfooconfig.yaml
npx promptfoo@latest view
```

## Advanced Features

### 1. LLM Cascading

Automatically fall back to cheaper/faster models when:

- Primary model errors
- Latency exceeds threshold
- Cost exceeds budget

**Presets available:**

- `qualityFirst` - GPT-4o → GPT-4o-mini → GPT-3.5-turbo
- `costOptimized` - GPT-4o-mini → GPT-4o
- `balanced` - GPT-4o-mini → GPT-4o → GPT-3.5-turbo
- `latencySensitive` - GPT-3.5-turbo → GPT-4o-mini (2s max latency)
- `claudeFocused` - Claude Sonnet 4 → Claude Sonnet 3.5 → Claude Haiku
- `multiProvider` - GPT-4o → Claude Sonnet 4 → Gemini 2.0

**Custom configuration:**

```yaml
llmCascade:
  primary: gpt-4o
  fallback:
    - gpt-4o-mini
    - gpt-3.5-turbo
  cascadeOnError: true
  cascadeOnLatency:
    enabled: true
    maxLatencyMs: 3000
  cascadeOnCost:
    enabled: true
    maxCostPerRequest: 0.10
```

### 2. Custom LLM Integration

Use your own LLM endpoint:

```yaml
customLLM:
  name: my-custom-model
  url: https://api.mycompany.com/v1/chat
  apiKey: ${CUSTOM_LLM_API_KEY}
  model: custom-model-v2
  temperature: 0.8
  maxTokens: 2000
  headers:
    X-Custom-Header: value
```

### 3. Model Context Protocol (MCP)

Advanced tool orchestration with approval policies:

```yaml
mcpConfig:
  serverUrl: https://mcp.example.com
  approvalPolicy: conditional
  approvalConditions:
    requireApprovalForTools:
      - delete_data
      - send_payment
      - modify_permissions
    requireApprovalForCost: 1.0
  timeout: 30000
```

**Presets:**

- `autoApprove` - Auto-approve all tools
- `manualApproval` - Require approval for all
- `conditionalLowRisk` - Approve safe tools, block destructive ones
- `conditionalPermissive` - Very permissive, block only critical actions
- `conditionalRestrictive` - Restrictive, approve only read operations

### 4. Multi-voice Conversations

Different voices for different characters:

```yaml
multiVoice:
  characters:
    - name: Agent
      voiceId: 21m00Tcm4TlvDq8ikWAM
      role: Customer support representative
    - name: Customer
      voiceId: 2EiwWnXFnvU5JabPnv8n
      role: Customer seeking help
  defaultVoiceId: 21m00Tcm4TlvDq8ikWAM
```

**Presets:**

- `customerService` - Agent + Customer
- `salesCall` - Sales Rep + Prospect
- `interview` - Interviewer + Candidate
- `podcast` - Host + Guest
- `training` - Trainer + Trainee
- `mediation` - Mediator + Two Parties

### 5. Post-call Webhooks

Receive notifications after conversations:

```yaml
postCallWebhook:
  url: https://api.mycompany.com/webhooks/elevenlabs
  method: POST
  headers:
    Authorization: Bearer ${WEBHOOK_SECRET}
  includeTranscript: true
  includeRecording: false
  includeAnalysis: true
```

**Webhook payload includes:**

- Event type (`conversation.completed` or `conversation.failed`)
- Conversation ID
- Transcript (optional)
- Recording URL (optional)
- Analysis with evaluation results (optional)

### 6. Phone Integration

Test with real phone calls:

**Twilio:**

```yaml
phoneConfig:
  provider: twilio
  twilioAccountSid: ${TWILIO_ACCOUNT_SID}
  twilioAuthToken: ${TWILIO_AUTH_TOKEN}
  twilioPhoneNumber: +1234567890
  recordCalls: true
  transcribeCalls: true
  batchCalling:
    enabled: true
    phoneNumbers:
      - +1987654321
      - +1555123456
    concurrent: 3
```

**SIP:**

```yaml
phoneConfig:
  provider: sip
  sipUri: sip:agent@mycompany.com
  sipUsername: agent_user
  sipPassword: ${SIP_PASSWORD}
  recordCalls: true
  transcribeCalls: true
```

## Tool Mocking

Mock tool responses for testing:

```yaml
toolMockConfig:
  get_order_status:
    returnValue:
      status: shipped
      tracking: TRACK123
      eta: 2024-10-28
  send_email:
    returnValue:
      sent: true
      message_id: MSG-456
  create_ticket:
    error: Service temporarily unavailable
```

## What to look for

1. **LLM cascade analytics**: Which models were used, why cascading occurred
2. **MCP tool approvals**: Which tools required approval, approval patterns
3. **Multi-voice quality**: Voice consistency across characters
4. **Webhook deliveries**: Successful webhook notifications
5. **Phone call metrics**: Call quality, transcription accuracy (if using phone integration)
6. **Cost optimization**: Actual costs vs. budgeted costs with cascading

## Learn more

- [ElevenLabs Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Twilio Integration](https://elevenlabs.io/docs/conversational-ai/phone)
- [Pricing](https://elevenlabs.io/pricing)

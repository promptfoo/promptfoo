/**
 * Phone integration (Twilio/SIP) for ElevenLabs Agents
 *
 * Enables testing agents via real phone calls
 */

import logger from '../../../logger';
import { ElevenLabsClient } from '../client';
import type { PhoneConfig } from './types';

/**
 * Set up phone integration for an agent
 */
export async function setupPhoneIntegration(
  client: ElevenLabsClient,
  agentId: string,
  config: PhoneConfig,
): Promise<void> {
  logger.debug('[ElevenLabs Phone] Setting up phone integration', {
    agentId,
    provider: config.provider,
  });

  if (config.provider === 'twilio') {
    await setupTwilioIntegration(client, agentId, config);
  } else if (config.provider === 'sip') {
    await setupSIPIntegration(client, agentId, config);
  } else {
    throw new Error(`Unsupported phone provider: ${config.provider}`);
  }

  logger.debug('[ElevenLabs Phone] Phone integration configured', {
    agentId,
    provider: config.provider,
  });
}

/**
 * Set up Twilio integration
 */
async function setupTwilioIntegration(
  client: ElevenLabsClient,
  agentId: string,
  config: PhoneConfig,
): Promise<void> {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error('Twilio Account SID and Auth Token are required');
  }

  await client.post(`/convai/agents/${agentId}/phone/twilio`, {
    account_sid: config.twilioAccountSid,
    auth_token: config.twilioAuthToken,
    phone_number: config.twilioPhoneNumber,
    record_calls: config.recordCalls || false,
    transcribe_calls: config.transcribeCalls !== false,
    batch_calling: config.batchCalling,
  });

  logger.debug('[ElevenLabs Phone] Twilio integration configured', {
    phoneNumber: config.twilioPhoneNumber,
  });
}

/**
 * Set up SIP integration
 */
async function setupSIPIntegration(
  client: ElevenLabsClient,
  agentId: string,
  config: PhoneConfig,
): Promise<void> {
  if (!config.sipUri) {
    throw new Error('SIP URI is required');
  }

  await client.post(`/convai/agents/${agentId}/phone/sip`, {
    sip_uri: config.sipUri,
    username: config.sipUsername,
    password: config.sipPassword,
    record_calls: config.recordCalls || false,
    transcribe_calls: config.transcribeCalls !== false,
  });

  logger.debug('[ElevenLabs Phone] SIP integration configured', {
    sipUri: config.sipUri,
  });
}

/**
 * Validate phone configuration
 */
export function validatePhoneConfig(config: PhoneConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate provider
  if (!config.provider) {
    errors.push('Phone provider is required');
  } else if (!['twilio', 'sip'].includes(config.provider)) {
    errors.push('Phone provider must be "twilio" or "sip"');
  }

  // Validate Twilio-specific fields
  if (config.provider === 'twilio') {
    if (!config.twilioAccountSid) {
      errors.push('Twilio Account SID is required');
    }

    if (!config.twilioAuthToken) {
      errors.push('Twilio Auth Token is required');
    }

    if (config.twilioPhoneNumber && !isValidPhoneNumber(config.twilioPhoneNumber)) {
      errors.push('Invalid Twilio phone number format');
    }
  }

  // Validate SIP-specific fields
  if (config.provider === 'sip') {
    if (!config.sipUri) {
      errors.push('SIP URI is required');
    } else if (!isValidSIPUri(config.sipUri)) {
      errors.push('Invalid SIP URI format');
    }
  }

  // Validate batch calling
  if (config.batchCalling?.enabled) {
    if (!config.batchCalling.phoneNumbers || config.batchCalling.phoneNumbers.length === 0) {
      errors.push('Batch calling requires at least one phone number');
    }

    if (config.batchCalling.concurrent !== undefined && config.batchCalling.concurrent <= 0) {
      errors.push('Concurrent calls must be positive');
    }

    // Validate phone number format
    for (const phone of config.batchCalling.phoneNumbers || []) {
      if (!isValidPhoneNumber(phone)) {
        errors.push(`Invalid phone number format: ${phone}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate phone number format (E.164)
 */
function isValidPhoneNumber(phone: string): boolean {
  // E.164 format: +[country code][number]
  const e164Pattern = /^\+[1-9]\d{1,14}$/;
  return e164Pattern.test(phone);
}

/**
 * Validate SIP URI format
 */
function isValidSIPUri(uri: string): boolean {
  // Basic SIP URI validation: sip:user@domain or sips:user@domain
  const sipPattern = /^sips?:[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
  return sipPattern.test(uri);
}

/**
 * Format phone number to E.164
 */
export function formatPhoneNumber(phone: string, countryCode: string = '+1'): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Add country code if not present
  if (!digits.startsWith('+')) {
    return `${countryCode}${digits}`;
  }

  return `+${digits}`;
}

/**
 * Initiate a test call
 */
export async function initiateTestCall(
  client: ElevenLabsClient,
  agentId: string,
  phoneNumber: string,
): Promise<{
  callId: string;
  status: string;
}> {
  logger.debug('[ElevenLabs Phone] Initiating test call', {
    agentId,
    phoneNumber,
  });

  const response = await client.post<{
    call_id: string;
    status: string;
  }>(`/convai/agents/${agentId}/phone/call`, {
    phone_number: phoneNumber,
    test_call: true,
  });

  logger.debug('[ElevenLabs Phone] Test call initiated', {
    callId: response.call_id,
    status: response.status,
  });

  return {
    callId: response.call_id,
    status: response.status,
  };
}

/**
 * Get call status
 */
export async function getCallStatus(
  client: ElevenLabsClient,
  callId: string,
): Promise<{
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed';
  duration_seconds?: number;
  recording_url?: string;
  transcript?: string;
}> {
  const response = await client.get<{
    status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed';
    duration_seconds?: number;
    recording_url?: string;
    transcript?: string;
  }>(`/convai/phone/calls/${callId}`);

  return response;
}

/**
 * Batch calling status
 */
export interface BatchCallStatus {
  batch_id: string;
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  in_progress_calls: number;
  results: Array<{
    phone_number: string;
    call_id?: string;
    status: string;
    duration_seconds?: number;
    error?: string;
  }>;
}

/**
 * Get batch calling status
 */
export async function getBatchCallStatus(
  client: ElevenLabsClient,
  batchId: string,
): Promise<BatchCallStatus> {
  const response = await client.get<BatchCallStatus>(`/convai/phone/batch/${batchId}`);
  return response;
}

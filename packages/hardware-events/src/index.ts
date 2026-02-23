import { z } from 'zod';

// ─── Core Hardware Event Interfaces ──────────────────────────────────────────

export interface LogiHardwareEvent {
  timestamp: number;
  deviceId: 'MX_MASTER_4' | 'MX_CREATIVE_CONSOLE';
  componentId: 'ACTIONS_RING' | 'DIAL_A' | 'DIAL_B' | 'KEYPAD';
  eventType: 'PRESS' | 'RELEASE' | 'ROTATE' | 'TAP';
  value?: number | string;
}

export interface SynapseState {
  isClutchEngaged: boolean;
  activeAgentContext: 'CODER' | 'NAVIGATOR' | 'RESEARCHER';
  computeMixWeight: number; // 0.0 (100% Local) to 1.0 (100% Cloud)
  voicePipelineStatus: 'IDLE' | 'LISTENING' | 'PROCESSING';
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const LogiHardwareEventSchema = z.object({
  timestamp: z.number().int().positive(),
  deviceId: z.enum(['MX_MASTER_4', 'MX_CREATIVE_CONSOLE']),
  componentId: z.enum(['ACTIONS_RING', 'DIAL_A', 'DIAL_B', 'KEYPAD']),
  eventType: z.enum(['PRESS', 'RELEASE', 'ROTATE', 'TAP']),
  value: z.union([z.number(), z.string()]).optional(),
});

export const SynapseStateSchema = z.object({
  isClutchEngaged: z.boolean(),
  activeAgentContext: z.enum(['CODER', 'NAVIGATOR', 'RESEARCHER']),
  computeMixWeight: z.number().min(0).max(1),
  voicePipelineStatus: z.enum(['IDLE', 'LISTENING', 'PROCESSING']),
});

// ─── Synapse Event Types (internal bus) ──────────────────────────────────────

export const SynapseEventTypeSchema = z.enum([
  'SYNAPSE_CLUTCH_ENGAGE',
  'SYNAPSE_CLUTCH_RELEASE',
  'SYNAPSE_DIAL_COMPUTE_MIX',
  'SYNAPSE_DIAL_CONTEXT_WINDOW',
  'SYNAPSE_KEYPAD_CONTEXT_SWITCH',
]);

export type SynapseEventType = z.infer<typeof SynapseEventTypeSchema>;

export const SynapseEventSchema = z.object({
  type: SynapseEventTypeSchema,
  timestamp: z.number().int().positive(),
  payload: z.record(z.unknown()).optional(),
});

export type SynapseEvent = z.infer<typeof SynapseEventSchema>;

// ─── Hardware-to-Synapse mapping helpers ─────────────────────────────────────

/**
 * Maps a raw LogiHardwareEvent to the appropriate SynapseEvent type.
 * Returns undefined if the event has no mapped Synapse action.
 */
export function mapHardwareEventToSynapseType(
  event: LogiHardwareEvent,
): SynapseEventType | undefined {
  const { deviceId, componentId, eventType } = event;

  if (deviceId === 'MX_MASTER_4' && componentId === 'ACTIONS_RING') {
    if (eventType === 'PRESS') return 'SYNAPSE_CLUTCH_ENGAGE';
    if (eventType === 'RELEASE') return 'SYNAPSE_CLUTCH_RELEASE';
  }

  if (deviceId === 'MX_CREATIVE_CONSOLE') {
    if (componentId === 'DIAL_A' && eventType === 'ROTATE') {
      return 'SYNAPSE_DIAL_COMPUTE_MIX';
    }
    if (componentId === 'DIAL_B' && eventType === 'ROTATE') {
      return 'SYNAPSE_DIAL_CONTEXT_WINDOW';
    }
    if (componentId === 'KEYPAD' && (eventType === 'PRESS' || eventType === 'TAP')) {
      return 'SYNAPSE_KEYPAD_CONTEXT_SWITCH';
    }
  }

  return undefined;
}

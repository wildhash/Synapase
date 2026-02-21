import {
  LogiHardwareEventSchema,
  SynapseStateSchema,
  SynapseEventSchema,
  mapHardwareEventToSynapseType,
  type LogiHardwareEvent,
} from './index';

describe('LogiHardwareEventSchema', () => {
  it('validates a valid ACTIONS_RING PRESS event', () => {
    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_MASTER_4',
      componentId: 'ACTIONS_RING',
      eventType: 'PRESS',
    };
    expect(() => LogiHardwareEventSchema.parse(event)).not.toThrow();
  });

  it('validates a DIAL_A ROTATE event with numeric value', () => {
    const event = {
      timestamp: Date.now(),
      deviceId: 'MX_CREATIVE_CONSOLE',
      componentId: 'DIAL_A',
      eventType: 'ROTATE',
      value: 5,
    };
    expect(() => LogiHardwareEventSchema.parse(event)).not.toThrow();
  });

  it('rejects an event with unknown deviceId', () => {
    const event = {
      timestamp: Date.now(),
      deviceId: 'UNKNOWN_DEVICE',
      componentId: 'ACTIONS_RING',
      eventType: 'PRESS',
    };
    expect(() => LogiHardwareEventSchema.parse(event)).toThrow();
  });

  it('rejects an event with negative timestamp', () => {
    const event = {
      timestamp: -1,
      deviceId: 'MX_MASTER_4',
      componentId: 'ACTIONS_RING',
      eventType: 'PRESS',
    };
    expect(() => LogiHardwareEventSchema.parse(event)).toThrow();
  });
});

describe('SynapseStateSchema', () => {
  it('validates a valid idle state', () => {
    const state = {
      isClutchEngaged: false,
      activeAgentContext: 'CODER',
      computeMixWeight: 0.5,
      voicePipelineStatus: 'IDLE',
    };
    expect(() => SynapseStateSchema.parse(state)).not.toThrow();
  });

  it('rejects computeMixWeight out of range', () => {
    const state = {
      isClutchEngaged: false,
      activeAgentContext: 'CODER',
      computeMixWeight: 1.5,
      voicePipelineStatus: 'IDLE',
    };
    expect(() => SynapseStateSchema.parse(state)).toThrow();
  });
});

describe('SynapseEventSchema', () => {
  it('validates a SYNAPSE_CLUTCH_ENGAGE event', () => {
    const event = {
      type: 'SYNAPSE_CLUTCH_ENGAGE',
      timestamp: Date.now(),
    };
    expect(() => SynapseEventSchema.parse(event)).not.toThrow();
  });
});

describe('mapHardwareEventToSynapseType', () => {
  it('maps MX_MASTER_4 ACTIONS_RING PRESS to SYNAPSE_CLUTCH_ENGAGE', () => {
    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_MASTER_4',
      componentId: 'ACTIONS_RING',
      eventType: 'PRESS',
    };
    expect(mapHardwareEventToSynapseType(event)).toBe('SYNAPSE_CLUTCH_ENGAGE');
  });

  it('maps MX_MASTER_4 ACTIONS_RING RELEASE to SYNAPSE_CLUTCH_RELEASE', () => {
    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_MASTER_4',
      componentId: 'ACTIONS_RING',
      eventType: 'RELEASE',
    };
    expect(mapHardwareEventToSynapseType(event)).toBe('SYNAPSE_CLUTCH_RELEASE');
  });

  it('maps MX_CREATIVE_CONSOLE DIAL_A ROTATE to SYNAPSE_DIAL_COMPUTE_MIX', () => {
    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_CREATIVE_CONSOLE',
      componentId: 'DIAL_A',
      eventType: 'ROTATE',
      value: 3,
    };
    expect(mapHardwareEventToSynapseType(event)).toBe('SYNAPSE_DIAL_COMPUTE_MIX');
  });

  it('maps MX_CREATIVE_CONSOLE DIAL_B ROTATE to SYNAPSE_DIAL_CONTEXT_WINDOW', () => {
    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_CREATIVE_CONSOLE',
      componentId: 'DIAL_B',
      eventType: 'ROTATE',
      value: -2,
    };
    expect(mapHardwareEventToSynapseType(event)).toBe('SYNAPSE_DIAL_CONTEXT_WINDOW');
  });

  it('maps MX_CREATIVE_CONSOLE KEYPAD PRESS to SYNAPSE_KEYPAD_CONTEXT_SWITCH', () => {
    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_CREATIVE_CONSOLE',
      componentId: 'KEYPAD',
      eventType: 'PRESS',
      value: 1,
    };
    expect(mapHardwareEventToSynapseType(event)).toBe('SYNAPSE_KEYPAD_CONTEXT_SWITCH');
  });

  it('returns undefined for unrecognized event combinations', () => {
    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_MASTER_4',
      componentId: 'KEYPAD',
      eventType: 'ROTATE',
    };
    expect(mapHardwareEventToSynapseType(event)).toBeUndefined();
  });
});

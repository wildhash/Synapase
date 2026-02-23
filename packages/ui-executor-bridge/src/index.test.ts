import {
  MockUiExecutorBridge,
  keypadToPersona,
  ClutchEventSchema,
  AgentPersonaSchema,
  type AgentPersona,
} from './index';

describe('AgentPersonaSchema', () => {
  it('validates known personas', () => {
    expect(() => AgentPersonaSchema.parse('CODER')).not.toThrow();
    expect(() => AgentPersonaSchema.parse('NAVIGATOR')).not.toThrow();
    expect(() => AgentPersonaSchema.parse('RESEARCHER')).not.toThrow();
  });

  it('rejects unknown personas', () => {
    expect(() => AgentPersonaSchema.parse('HACKER')).toThrow();
  });
});

describe('ClutchEventSchema', () => {
  it('validates an ENGAGE event', () => {
    expect(() =>
      ClutchEventSchema.parse({
        type: 'ENGAGE',
        timestamp: Date.now(),
        agentPersona: 'CODER',
      }),
    ).not.toThrow();
  });

  it('rejects an event missing agentPersona', () => {
    expect(() =>
      ClutchEventSchema.parse({
        type: 'ENGAGE',
        timestamp: Date.now(),
      }),
    ).toThrow();
  });
});

describe('keypadToPersona', () => {
  it('maps key 1 to CODER', () => {
    expect(keypadToPersona(1)).toBe('CODER');
  });

  it('maps key 2 to NAVIGATOR', () => {
    expect(keypadToPersona(2)).toBe('NAVIGATOR');
  });

  it('maps key 3 to RESEARCHER', () => {
    expect(keypadToPersona(3)).toBe('RESEARCHER');
  });

  it('returns undefined for unmapped keys', () => {
    expect(keypadToPersona(4)).toBeUndefined();
    expect(keypadToPersona(99)).toBeUndefined();
  });
});

describe('MockUiExecutorBridge', () => {
  it('starts with PHYSICAL_MOUSE owner', () => {
    const bridge = new MockUiExecutorBridge();
    expect(bridge.getControlState().owner).toBe('PHYSICAL_MOUSE');
  });

  it('hands control to JAYU_AGENT on engage', async () => {
    const bridge = new MockUiExecutorBridge();
    const event = ClutchEventSchema.parse({
      type: 'ENGAGE',
      timestamp: Date.now(),
      agentPersona: 'CODER',
    });
    await bridge.engage(event);
    expect(bridge.getControlState().owner).toBe('JAYU_AGENT');
    expect(bridge.getActivePersona()).toBe('CODER');
  });

  it('returns OS control on release (Priority 0 interrupt)', async () => {
    const bridge = new MockUiExecutorBridge();
    const engage = ClutchEventSchema.parse({
      type: 'ENGAGE',
      timestamp: Date.now(),
      agentPersona: 'NAVIGATOR',
    });
    const release = ClutchEventSchema.parse({
      type: 'RELEASE',
      timestamp: Date.now(),
      agentPersona: 'NAVIGATOR',
    });
    await bridge.engage(engage);
    await bridge.release(release);
    expect(bridge.getControlState().owner).toBe('PHYSICAL_MOUSE');
  });

  it('release always executes even if not engaged', async () => {
    const bridge = new MockUiExecutorBridge();
    const release = ClutchEventSchema.parse({
      type: 'RELEASE',
      timestamp: Date.now(),
      agentPersona: 'CODER',
    });
    await bridge.release(release);
    expect(bridge.getControlState().owner).toBe('PHYSICAL_MOUSE');
  });

  it('switches persona via keypad', () => {
    const bridge = new MockUiExecutorBridge();
    bridge.switchPersona('RESEARCHER');
    expect(bridge.getActivePersona()).toBe('RESEARCHER');
  });

  it('engage is idempotent when already engaged', async () => {
    const bridge = new MockUiExecutorBridge();
    const ts = Date.now();
    const event = ClutchEventSchema.parse({
      type: 'ENGAGE',
      timestamp: ts,
      agentPersona: 'CODER',
    });
    await bridge.engage(event);
    await bridge.engage({ ...event, timestamp: ts + 100 });
    // handedOffAt should remain from first engage
    expect(bridge.getControlState().handedOffAt).toBe(ts);
  });
});

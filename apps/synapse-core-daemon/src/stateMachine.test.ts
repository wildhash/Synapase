import { SynapseMachine } from './stateMachine';

describe('SynapseMachine', () => {
  it('starts in IDLE state', () => {
    const machine = new SynapseMachine();
    expect(machine.getState()).toBe('IDLE');
    expect(machine.getData().isClutchEngaged).toBe(false);
    expect(machine.getData().voicePipelineStatus).toBe('IDLE');
  });

  it('transitions to CLUTCH_ENGAGED on CLUTCH_ENGAGE', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'CLUTCH_ENGAGE', persona: 'CODER' });
    expect(machine.getState()).toBe('CLUTCH_ENGAGED');
    expect(machine.getData().isClutchEngaged).toBe(true);
    expect(machine.getData().voicePipelineStatus).toBe('LISTENING');
    expect(machine.getData().activeAgentContext).toBe('CODER');
  });

  it('transitions to VOICE_ACTIVE on VOICE_READY from CLUTCH_ENGAGED', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'CLUTCH_ENGAGE' });
    machine.send({ type: 'VOICE_READY' });
    expect(machine.getState()).toBe('VOICE_ACTIVE');
    expect(machine.getData().voicePipelineStatus).toBe('PROCESSING');
  });

  it('transitions to AGENT_EXECUTING on AGENT_READY from VOICE_ACTIVE', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'CLUTCH_ENGAGE' });
    machine.send({ type: 'VOICE_READY' });
    machine.send({ type: 'AGENT_READY' });
    expect(machine.getState()).toBe('AGENT_EXECUTING');
  });

  it('CLUTCH_RELEASE from CLUTCH_ENGAGED returns to IDLE (priority 0)', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'CLUTCH_ENGAGE' });
    machine.send({ type: 'CLUTCH_RELEASE' });
    expect(machine.getState()).toBe('IDLE');
    expect(machine.getData().isClutchEngaged).toBe(false);
    expect(machine.getData().voicePipelineStatus).toBe('IDLE');
  });

  it('CLUTCH_RELEASE from VOICE_ACTIVE returns to IDLE (priority 0 interrupt)', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'CLUTCH_ENGAGE' });
    machine.send({ type: 'VOICE_READY' });
    machine.send({ type: 'CLUTCH_RELEASE' });
    expect(machine.getState()).toBe('IDLE');
  });

  it('CLUTCH_RELEASE from AGENT_EXECUTING returns to IDLE (hard stop)', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'CLUTCH_ENGAGE' });
    machine.send({ type: 'VOICE_READY' });
    machine.send({ type: 'AGENT_READY' });
    machine.send({ type: 'CLUTCH_RELEASE' });
    expect(machine.getState()).toBe('IDLE');
  });

  it('DIAL_COMPUTE adjusts computeMixWeight in IDLE', () => {
    const machine = new SynapseMachine();
    const initial = machine.getData().computeMixWeight;
    machine.send({ type: 'DIAL_COMPUTE', delta: 2 });
    expect(machine.getData().computeMixWeight).toBeCloseTo(initial + 0.1, 5);
  });

  it('clamps computeMixWeight to [0, 1]', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'DIAL_COMPUTE', delta: 100 });
    expect(machine.getData().computeMixWeight).toBe(1);
    machine.send({ type: 'DIAL_COMPUTE', delta: -200 });
    expect(machine.getData().computeMixWeight).toBe(0);
  });

  it('KEYPAD_SWITCH changes activeAgentContext in IDLE', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'KEYPAD_SWITCH', persona: 'RESEARCHER' });
    expect(machine.getData().activeAgentContext).toBe('RESEARCHER');
  });

  it('KEYPAD_SWITCH changes activeAgentContext in CLUTCH_ENGAGED', () => {
    const machine = new SynapseMachine();
    machine.send({ type: 'CLUTCH_ENGAGE' });
    machine.send({ type: 'KEYPAD_SWITCH', persona: 'NAVIGATOR' });
    expect(machine.getData().activeAgentContext).toBe('NAVIGATOR');
  });
});

import type { SynapseState } from '@synapse/hardware-events';

// ─── State Machine Types ──────────────────────────────────────────────────────

export type SynapseStateValue =
  | 'IDLE'
  | 'CLUTCH_ENGAGED'
  | 'VOICE_ACTIVE'
  | 'AGENT_EXECUTING';

export type SynapseMachineEvent =
  | { type: 'CLUTCH_ENGAGE'; persona?: 'CODER' | 'NAVIGATOR' | 'RESEARCHER' }
  | { type: 'CLUTCH_RELEASE' }
  | { type: 'VOICE_READY' }
  | { type: 'AGENT_READY' }
  | { type: 'DIAL_COMPUTE'; delta: number }
  | { type: 'DIAL_CONTEXT'; delta: number }
  | { type: 'KEYPAD_SWITCH'; persona: 'CODER' | 'NAVIGATOR' | 'RESEARCHER' };

// ─── Synapse State Machine (no external XState dep for core logic) ─────────────

/**
 * Lightweight deterministic state machine for Project Synapse.
 * Manages clutch, voice pipeline, and agent execution states.
 */
export class SynapseMachine {
  private stateValue: SynapseStateValue = 'IDLE';
  private data: SynapseState = {
    isClutchEngaged: false,
    activeAgentContext: 'CODER',
    computeMixWeight: 0.5,
    voicePipelineStatus: 'IDLE',
  };

  getState(): SynapseStateValue {
    return this.stateValue;
  }

  getData(): Readonly<SynapseState> {
    return { ...this.data };
  }

  send(event: SynapseMachineEvent): SynapseStateValue {
    switch (this.stateValue) {
      case 'IDLE':
        return this.handleIdle(event);
      case 'CLUTCH_ENGAGED':
        return this.handleClutchEngaged(event);
      case 'VOICE_ACTIVE':
        return this.handleVoiceActive(event);
      case 'AGENT_EXECUTING':
        return this.handleAgentExecuting(event);
      default:
        return this.stateValue;
    }
  }

  private handleIdle(event: SynapseMachineEvent): SynapseStateValue {
    switch (event.type) {
      case 'CLUTCH_ENGAGE':
        this.data = {
          ...this.data,
          isClutchEngaged: true,
          voicePipelineStatus: 'LISTENING',
          activeAgentContext: event.persona ?? this.data.activeAgentContext,
        };
        this.stateValue = 'CLUTCH_ENGAGED';
        break;
      case 'DIAL_COMPUTE':
        this.applyDialCompute(event.delta);
        break;
      case 'DIAL_CONTEXT':
        // handled by KernelMixer, no state transition needed
        break;
      case 'KEYPAD_SWITCH':
        this.data = { ...this.data, activeAgentContext: event.persona };
        break;
    }
    return this.stateValue;
  }

  private handleClutchEngaged(event: SynapseMachineEvent): SynapseStateValue {
    switch (event.type) {
      case 'CLUTCH_RELEASE':
        this.releaseClutch();
        break;
      case 'VOICE_READY':
        this.data = { ...this.data, voicePipelineStatus: 'PROCESSING' };
        this.stateValue = 'VOICE_ACTIVE';
        break;
      case 'DIAL_COMPUTE':
        this.applyDialCompute(event.delta);
        break;
      case 'KEYPAD_SWITCH':
        this.data = { ...this.data, activeAgentContext: event.persona };
        break;
    }
    return this.stateValue;
  }

  private handleVoiceActive(event: SynapseMachineEvent): SynapseStateValue {
    switch (event.type) {
      case 'CLUTCH_RELEASE':
        // Priority 0 interrupt — always executes
        this.releaseClutch();
        break;
      case 'AGENT_READY':
        this.stateValue = 'AGENT_EXECUTING';
        break;
      case 'DIAL_COMPUTE':
        this.applyDialCompute(event.delta);
        break;
    }
    return this.stateValue;
  }

  private handleAgentExecuting(event: SynapseMachineEvent): SynapseStateValue {
    switch (event.type) {
      case 'CLUTCH_RELEASE':
        // Priority 0 interrupt — hard stop
        this.releaseClutch();
        break;
      case 'DIAL_COMPUTE':
        this.applyDialCompute(event.delta);
        break;
    }
    return this.stateValue;
  }

  private releaseClutch(): void {
    this.stateValue = 'IDLE';
    this.data = {
      ...this.data,
      isClutchEngaged: false,
      voicePipelineStatus: 'IDLE',
    };
  }

  private applyDialCompute(delta: number): void {
    const step = 0.05;
    const newWeight = Math.min(1, Math.max(0, this.data.computeMixWeight + delta * step));
    this.data = { ...this.data, computeMixWeight: newWeight };
  }
}

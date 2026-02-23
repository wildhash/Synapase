import { useEffect, useState } from 'react';
import type { SynapseState } from '@synapse/hardware-events';
import type { TranscriptionResult } from '@synapse/voice-pipeline';
import type { AgentPersona, OsControlState } from '@synapse/ui-executor-bridge';
import type { DaemonState, KernelConfig } from './daemon';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function useDemoDaemonState(enabled: boolean): DaemonState {
  const [state, setState] = useState<SynapseState>({
    isClutchEngaged: false,
    activeAgentContext: 'CODER',
    computeMixWeight: 0.36,
    voicePipelineStatus: 'IDLE',
  });

  const [kernelConfig, setKernelConfig] = useState<KernelConfig>({
    computeMixWeight: 0.36,
    contextWindowTokens: 32_000,
    primaryModel: 'claude-3.5-sonnet',
  });

  const [osControlState, setOsControlState] = useState<OsControlState>({
    owner: 'PHYSICAL_MOUSE',
    activePersona: 'CODER',
  });

  const [machineState, setMachineState] = useState<string>('IDLE');
  const [synapseType, setSynapseType] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);

  useEffect(() => {
    if (!enabled) return () => undefined;

    function setPersona(persona: AgentPersona): void {
      setState((s) => ({ ...s, activeAgentContext: persona }));
      setOsControlState((s) => ({ ...s, activePersona: persona }));
      setSynapseType('SYNAPSE_KEYPAD_CONTEXT_SWITCH');
    }

    function toggleClutch(): void {
      setState((s) => {
        const engaged = !s.isClutchEngaged;
        setSynapseType(engaged ? 'SYNAPSE_CLUTCH_ENGAGE' : 'SYNAPSE_CLUTCH_RELEASE');
        setMachineState(engaged ? 'CLUTCH_ENGAGED' : 'IDLE');
        setOsControlState((o) => ({
          owner: engaged ? 'JAYU_AGENT' : 'PHYSICAL_MOUSE',
          handedOffAt: engaged ? Date.now() : undefined,
          activePersona: o.activePersona,
        }));
        return {
          ...s,
          isClutchEngaged: engaged,
          voicePipelineStatus: engaged ? 'LISTENING' : 'IDLE',
        };
      });
    }

    function adjustCompute(delta: number): void {
      setState((s) => {
        const next = clamp01(s.computeMixWeight + delta);
        setSynapseType('SYNAPSE_DIAL_COMPUTE_MIX');
        setKernelConfig((k) => ({ ...k, computeMixWeight: next }));
        return { ...s, computeMixWeight: next };
      });
    }

    function adjustContext(delta: number): void {
      setKernelConfig((k) => {
        const next = Math.min(128_000, Math.max(8_000, k.contextWindowTokens + delta));
        setSynapseType('SYNAPSE_DIAL_CONTEXT_WINDOW');
        return { ...k, contextWindowTokens: next };
      });
    }

    function triggerTranscription(): void {
      if (!state.isClutchEngaged) return;
      setSynapseType('VOICE_TRANSCRIPTION');
      setTranscription({
        transcript: 'Navigate to the repository and initialize a new branch.',
        isFinal: true,
        confidence: 0.95,
        durationMs: 780,
        timestamp: Date.now(),
      });
      setState((s) => ({ ...s, voicePipelineStatus: 'PROCESSING' }));
      setMachineState('VOICE_ACTIVE');
    }

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (e.key === ' ') {
        toggleClutch();
        return;
      }

      if (e.key === '1') return setPersona('CODER');
      if (e.key === '2') return setPersona('NAVIGATOR');
      if (e.key === '3') return setPersona('RESEARCHER');

      if (e.key === 'ArrowLeft') return adjustCompute(-0.05);
      if (e.key === 'ArrowRight') return adjustCompute(0.05);
      if (e.key === 'ArrowDown') return adjustContext(-8_000);
      if (e.key === 'ArrowUp') return adjustContext(8_000);
      if (e.key.toLowerCase() === 't') return triggerTranscription();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, state.isClutchEngaged]);

  return {
    connected: enabled,
    state,
    kernelConfig,
    osControlState,
    machineState,
    synapseType,
    latencyMs: 0,
    transcription,
  };
}

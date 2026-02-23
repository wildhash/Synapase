import { useEffect, useMemo, useRef, useState } from 'react';
import type { SynapseState } from '@synapse/hardware-events';
import type { TranscriptionResult } from '@synapse/voice-pipeline';
import type { AgentPersona, OsControlState } from '@synapse/ui-executor-bridge';
import type { DaemonState, KernelConfig } from './daemon';
import { useDaemonWs } from './daemon';

type TerminalLine = {
  ts: number;
  text: string;
};

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function pad3(value: number): string {
  return value.toString().padStart(3, '0');
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return tokens.toString();
}

function getActivePersona(state: SynapseState | null): AgentPersona | null {
  return state?.activeAgentContext ?? null;
}

function cx(...classes: Array<string | null | undefined | false>): string {
  return classes.filter(Boolean).join(' ');
}

function useDemoState(enabled: boolean): DaemonState {
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
        e.preventDefault();
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

function WaveformCanvas(props: {
  active: boolean;
  intensity: number;
}): JSX.Element {
  const { active, intensity } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isBrowser = typeof window !== 'undefined';
    const mediaQuery = isBrowser && 'matchMedia' in window
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const shouldAnimate = active && !(mediaQuery?.matches ?? false);
    let raf = 0;
    let stopped = false;

    const resize = () => {
      const dpr = isBrowser ? Math.max(1, window.devicePixelRatio || 1) : 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    resize();

    const drawFrame = (nowMs: number) => {
      if (stopped) return;
      const dpr = isBrowser ? Math.max(1, window.devicePixelRatio || 1) : 1;
      const w = canvas.width;
      const h = canvas.height;
      const t = nowMs / 1000;

      ctx.clearRect(0, 0, w, h);

      const center = h / 2;
      const base = h * 0.055;
      const amp = base + h * 0.28 * clamp01(intensity);

      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(41, 182, 255, 0.92)';
      ctx.shadowColor = 'rgba(41, 182, 255, 0.38)';
      ctx.shadowBlur = 18 * dpr;

      ctx.beginPath();
      const step = Math.max(1, Math.floor(w / 180));
      for (let x = 0; x <= w; x += step) {
        const p = x / w;
        const a = Math.sin(p * Math.PI * 2 + t * 2.4);
        const b = Math.sin(p * Math.PI * 6 - t * 1.7);
        const c = Math.sin(p * Math.PI * 14 + t * 1.05);
        const y = center + (a * 0.55 + b * 0.3 + c * 0.15) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.shadowBlur = 0;

      if (shouldAnimate && isBrowser) raf = window.requestAnimationFrame(drawFrame);
    };

    if (isBrowser) raf = window.requestAnimationFrame(drawFrame);

    return () => {
      stopped = true;
      if (isBrowser) window.cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [active, intensity]);

  return <canvas className="waveCanvas" ref={canvasRef} />;
}

function Meter(props: { value: number }): JSX.Element {
  const clamped = clamp01(props.value);
  return (
    <div className="meter">
      <div className="meterFill" style={{ transform: `scaleX(${clamped})` }} />
    </div>
  );
}

function App(): JSX.Element {
  const params = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search);
  }, []);
  const demoEnabled = params.get('demo') === '1';

  const daemon = useDaemonWs({ enabled: !demoEnabled });
  const demo = useDemoState(demoEnabled);

  const {
    connected,
    state,
    kernelConfig,
    osControlState,
    machineState,
    synapseType,
    latencyMs,
    transcription,
  } = demoEnabled ? demo : daemon;

  const clutchEngaged = Boolean(state?.isClutchEngaged);
  const osOwner = osControlState?.owner ?? (clutchEngaged ? 'JAYU_AGENT' : 'PHYSICAL_MOUSE');
  const persona = getActivePersona(state);
  const computeMix = kernelConfig?.computeMixWeight ?? state?.computeMixWeight ?? 0;
  const contextTokens = kernelConfig?.contextWindowTokens ?? 0;
  const primaryModel = kernelConfig?.primaryModel ?? null;
  const transcriptText = transcription?.transcript ?? null;

  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>(() => [
    {
      ts: Date.now(),
      text: demoEnabled
        ? 'DEMO: space=clutch, arrows=dials, 1-3=persona, t=transcript'
        : 'Awaiting daemon signal...',
    },
  ]);

  const lastSeenRef = useRef({
    connected: false,
    osOwner: osOwner,
    synapseType: null as string | null,
    transcription: null as TranscriptionResult | null,
    computeMix: computeMix,
    contextTokens: contextTokens,
    persona: persona,
  });

  useEffect(() => {
    const now = Date.now();
    const prior = lastSeenRef.current;
    const next: typeof prior = {
      connected,
      osOwner,
      synapseType,
      transcription,
      computeMix,
      contextTokens,
      persona,
    };

    const additions: TerminalLine[] = [];

    if (connected !== prior.connected) {
      additions.push({
        ts: now,
        text: connected
          ? demoEnabled
            ? 'UI overlay connected (demo mode)'
            : 'UI overlay connected'
          : 'UI overlay disconnected',
      });
    }

    if (osOwner !== prior.osOwner) {
      additions.push({
        ts: now,
        text: osOwner === 'JAYU_AGENT' ? 'OS_CONTROL_OWNER=JAYU_AGENT' : 'OS_CONTROL_OWNER=HUMAN',
      });
    }

    if (synapseType && synapseType !== prior.synapseType) {
      additions.push({ ts: now, text: `EVENT=${synapseType}` });
    }

    if (transcription && transcription !== prior.transcription) {
      additions.push({
        ts: now,
        text: `VOICE_TRANSCRIPT=${transcription.transcript}`,
      });
    }

    if (Math.abs(computeMix - prior.computeMix) > 0.001) {
      additions.push({
        ts: now,
        text: `KERNEL_COMPUTE_MIX=${Math.round(computeMix * 100)}%_CLOUD`,
      });
    }

    if (contextTokens && contextTokens !== prior.contextTokens) {
      additions.push({
        ts: now,
        text: `KERNEL_CONTEXT_WINDOW=${formatTokens(contextTokens)}`,
      });
    }

    if (persona && persona !== prior.persona) {
      additions.push({ ts: now, text: `PERSONA_SWITCH=${persona}` });
    }

    if (additions.length > 0) {
      setTerminalLines((lines) => {
        const merged = [...lines, ...additions];
        return merged.slice(Math.max(0, merged.length - 42));
      });
    }

    lastSeenRef.current = next;
  }, [
    computeMix,
    connected,
    contextTokens,
    demoEnabled,
    osOwner,
    persona,
    synapseType,
    transcription,
  ]);

  const clutchText =
    osOwner === 'JAYU_AGENT'
      ? '[JAYU_AUTONOMY_ENGAGED]'
      : 'SYSTEM: HUMAN CONTROL';

  const voiceIntensity = useMemo(() => {
    if (!clutchEngaged) return 0;
    if (state?.voicePipelineStatus === 'PROCESSING') return 0.38;
    if (state?.voicePipelineStatus === 'LISTENING') return 0.85;
    return 0.18;
  }, [clutchEngaged, state?.voicePipelineStatus]);

  const latencyLabel = latencyMs === null ? null : `${latencyMs.toFixed(2)}ms`;

  return (
    <div className="hudRoot">
      <div className="hudGrid" />
      <div className="hudNoise" />
      <div className={cx('screenDim', clutchEngaged && 'screenDimOn')} />

      <div className="topCenter">
        <div className={cx('panel', 'panelAccent', 'clutchContainer', clutchEngaged && 'clutchEngaged')}>
          {clutchEngaged ? <div className="clutchHalo" /> : <div className="clutchDot" />}
          <div className="clutchText">
            <span className="clutchTextStrong">{clutchText}</span>
            {machineState ? <span className="muted">&nbsp;({machineState})</span> : null}
          </div>
        </div>
      </div>

      <div className={cx('leftSidebar', 'panel', 'panelAccent')}>
        <div className="sidebarInner">
          <div>
            <div className="sectionTitle">Kernel mixer</div>
            <div className="row">
              <div className="muted">Compute</div>
              <div className="value">{Math.round(computeMix * 100)}% cloud</div>
            </div>
            <Meter value={computeMix} />
            <div className="row" style={{ marginTop: 10 }}>
              <div className="muted">Local</div>
              <div className="muted">Cloud</div>
            </div>
          </div>

          <div>
            <div className="sectionTitle">Context dial</div>
            <div className="row">
              <div className="muted">Window</div>
              <div className="value">{contextTokens ? `${formatTokens(contextTokens)} tokens` : '—'}</div>
            </div>
            {primaryModel ? (
              <div className="row" style={{ marginTop: 6 }}>
                <div className="muted">Primary model</div>
                <div className="value">{primaryModel}</div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="sectionTitle">Persona grid</div>
            <div className="personaGrid">
              <div className={cx('personaCard', persona === 'CODER' && 'personaActive')}>
                <div className="personaKey">KEY 1</div>
                <div className="personaName">CODER</div>
              </div>
              <div className={cx('personaCard', persona === 'NAVIGATOR' && 'personaActive')}>
                <div className="personaKey">KEY 2</div>
                <div className="personaName">NAVIGATOR</div>
              </div>
              <div className={cx('personaCard', persona === 'RESEARCHER' && 'personaActive')}>
                <div className="personaKey">KEY 3</div>
                <div className="personaName">RESEARCHER</div>
              </div>
              <div className="personaCard">
                <div className="personaKey">KEY 4</div>
                <div className="personaName muted">RESERVED</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={cx('rightTerminal', 'panel', 'panelAccent')}>
        <div className="terminalInner">
          <div className="sectionTitle">Execution terminal</div>
          <div>
            {terminalLines.map((line, idx) => (
              <div className="terminalLine" key={`${line.ts}-${idx}`}>
                <div className="terminalTs">{formatTs(line.ts)}</div>
                <div className="terminalText">&gt; {line.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={cx('bottomVisualizer', 'panel', 'panelAccent')}>
        <div className="visualizerInner">
          <div className="row">
            <div className="sectionTitle">Voice pipeline</div>
            <div className="muted">
              {state?.voicePipelineStatus ?? 'IDLE'}
              {latencyLabel ? <span>&nbsp;|&nbsp;last event {latencyLabel}</span> : null}
            </div>
          </div>
          <div className={cx('transcript', !transcriptText && 'transcriptFaint')}>
            {clutchEngaged
              ? transcriptText ?? 'Awaiting transcription...'
              : 'Hold clutch to visualize voice input'}
          </div>
          <WaveformCanvas active={clutchEngaged} intensity={voiceIntensity} />
        </div>
      </div>

      <div className={cx('statusBar', 'panel', connected ? 'statusGood' : 'statusBad')}>
        {demoEnabled ? 'demo' : connected ? 'daemon connected' : 'daemon disconnected'}
      </div>
    </div>
  );
}

export default App;

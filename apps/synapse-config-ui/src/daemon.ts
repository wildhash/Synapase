import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SynapseState } from '@synapse/hardware-events';
import type { TranscriptionResult } from '@synapse/voice-pipeline';
import type { OsControlState } from '@synapse/ui-executor-bridge';

export interface KernelConfig {
  computeMixWeight: number;
  contextWindowTokens: number;
  primaryModel: string;
}

export interface DaemonState {
  connected: boolean;
  state: SynapseState | null;
  kernelConfig: KernelConfig | null;
  osControlState: OsControlState | null;
  machineState: string | null;
  synapseType: string | null;
  latencyMs: number | null;
  transcription: TranscriptionResult | null;
}

interface DaemonMessage {
  type: string;
  state?: SynapseState;
  kernelConfig?: KernelConfig;
  latencyMs?: number;
  timestamp?: number;
  synapseType?: string;
  osControlState?: OsControlState;
  transcription?: TranscriptionResult;
  machineState?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePort(raw: string | null): number | null {
  if (!raw) return null;
  const candidate = Number(raw);
  return Number.isInteger(candidate) && candidate > 0 && candidate <= 65_535
    ? candidate
    : null;
}

const AGENT_PERSONAS = ['CODER', 'NAVIGATOR', 'RESEARCHER'] as const;
const VOICE_PIPELINE_STATUSES = ['IDLE', 'LISTENING', 'PROCESSING'] as const;
const OS_CONTROL_OWNERS = ['PHYSICAL_MOUSE', 'JAYU_AGENT'] as const;

function isSynapseState(value: unknown): value is SynapseState {
  if (!isRecord(value)) return false;

  return (
    typeof value.isClutchEngaged === 'boolean' &&
    AGENT_PERSONAS.includes(value.activeAgentContext as (typeof AGENT_PERSONAS)[number]) &&
    typeof value.computeMixWeight === 'number' &&
    value.computeMixWeight >= 0 &&
    value.computeMixWeight <= 1 &&
    VOICE_PIPELINE_STATUSES.includes(
      value.voicePipelineStatus as (typeof VOICE_PIPELINE_STATUSES)[number],
    )
  );
}

function isKernelConfig(value: unknown): value is KernelConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value.computeMixWeight === 'number' &&
    value.computeMixWeight >= 0 &&
    value.computeMixWeight <= 1 &&
    typeof value.contextWindowTokens === 'number' &&
    Number.isFinite(value.contextWindowTokens) &&
    value.contextWindowTokens >= 0 &&
    typeof value.primaryModel === 'string'
  );
}

function isOsControlState(value: unknown): value is OsControlState {
  if (!isRecord(value)) return false;
  const handedOffAt = value.handedOffAt;
  return (
    OS_CONTROL_OWNERS.includes(value.owner as (typeof OS_CONTROL_OWNERS)[number]) &&
    AGENT_PERSONAS.includes(value.activePersona as (typeof AGENT_PERSONAS)[number]) &&
    (handedOffAt === undefined || (typeof handedOffAt === 'number' && handedOffAt > 0))
  );
}

function isTranscriptionResult(value: unknown): value is TranscriptionResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.transcript === 'string' &&
    typeof value.isFinal === 'boolean' &&
    typeof value.confidence === 'number' &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    typeof value.durationMs === 'number' &&
    value.durationMs >= 0 &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    value.timestamp > 0
  );
}

function buildDaemonWsUrl(raw: string): string {
  const url = new URL(raw);
  if (!url.searchParams.has('role')) url.searchParams.set('role', 'ui');
  return url.toString();
}

function getDaemonWsUrl(): string {
  if (typeof window === 'undefined') return buildDaemonWsUrl('ws://localhost:4040/ws');

  const envOverride = (import.meta as { env?: { VITE_DAEMON_WS_URL?: unknown } }).env
    ?.VITE_DAEMON_WS_URL;
  if (typeof envOverride === 'string' && envOverride.length > 0) {
    try {
      return buildDaemonWsUrl(envOverride);
    } catch {
      console.warn('[synapse-config-ui] Invalid VITE_DAEMON_WS_URL; falling back to default', {
        value: envOverride,
      });
    }
  }

  const params = new URLSearchParams(window.location.search);
  const override = params.get('ws');
  if (override) {
    try {
      return buildDaemonWsUrl(override);
    } catch {
      console.warn('[synapse-config-ui] Invalid ws query param; falling back to default', {
        value: override,
      });
    }
  }

  const envPortOverride = (import.meta as { env?: { VITE_DAEMON_WS_PORT?: unknown } }).env
    ?.VITE_DAEMON_WS_PORT;
  const envPortRaw = typeof envPortOverride === 'string' ? envPortOverride : null;
  const envPort = parsePort(envPortRaw);
  if (envPortRaw && envPort === null) {
    console.warn('[synapse-config-ui] Invalid VITE_DAEMON_WS_PORT; falling back to default', {
      value: envPortRaw,
    });
  }

  const portParam = params.get('wsPort');
  const portFromQuery = parsePort(portParam);
  if (portParam && portFromQuery === null) {
    console.warn('[synapse-config-ui] Invalid wsPort query param; falling back to default', {
      value: portParam,
    });
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname || 'localhost';
  const port = envPort ?? portFromQuery ?? 4040;

  const defaultUrl = `${proto}//${host}:${port}/ws`;
  return buildDaemonWsUrl(defaultUrl);
}

export function useDaemonWs(options?: { enabled?: boolean }): DaemonState {
  const enabled = options?.enabled ?? true;
  const wsUrl = useMemo(() => getDaemonWsUrl(), []);

  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<SynapseState | null>(null);
  const [kernelConfig, setKernelConfig] = useState<KernelConfig | null>(null);
  const [osControlState, setOsControlState] = useState<OsControlState | null>(null);
  const [machineState, setMachineState] = useState<string | null>(null);
  const [synapseType, setSynapseType] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const destroyedRef = useRef(false);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    if (destroyedRef.current) return;

    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const priorWs = wsRef.current;
    if (priorWs) {
      priorWs.onopen = null;
      priorWs.onclose = null;
      priorWs.onerror = null;
      priorWs.onmessage = null;
      priorWs.close();
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (destroyedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
    };

    ws.onclose = () => {
      if (destroyedRef.current) return;
      setConnected(false);
      setState(null);
      setKernelConfig(null);
      setOsControlState(null);
      setMachineState(null);
      setSynapseType(null);
      setLatencyMs(null);
      setTranscription(null);

      if (reconnectTimeoutRef.current === null && enabledRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(connect, 1_750);
      }
    };

    ws.onerror = () => {
      if (destroyedRef.current) return;
      setConnected(false);
      setState(null);
      setKernelConfig(null);
      setOsControlState(null);
      setMachineState(null);
      setSynapseType(null);
      setLatencyMs(null);
      setTranscription(null);

      try {
        ws.close();
      } catch {
        // ignore
      }

      if (reconnectTimeoutRef.current === null && enabledRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(connect, 1_750);
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!isRecord(parsed)) return;
      if (parsed.type !== 'STATE_UPDATE') return;

      const msg: Record<string, unknown> = parsed;

      if ('state' in msg) {
        const nextState = msg.state;
        if (nextState === null) setState(null);
        else if (isSynapseState(nextState)) setState(nextState);
      }

      if ('kernelConfig' in msg) {
        const nextKernelConfig = msg.kernelConfig;
        if (nextKernelConfig === null) setKernelConfig(null);
        else if (isKernelConfig(nextKernelConfig)) setKernelConfig(nextKernelConfig);
      }

      if ('osControlState' in msg) {
        const nextOsControlState = msg.osControlState;
        if (nextOsControlState === null) setOsControlState(null);
        else if (isOsControlState(nextOsControlState)) setOsControlState(nextOsControlState);
      }

      if ('machineState' in msg) {
        const nextMachineState = msg.machineState;
        if (typeof nextMachineState === 'string' || nextMachineState === null) {
          setMachineState(nextMachineState ?? null);
        }
      }

      if ('synapseType' in msg) {
        const nextSynapseType = msg.synapseType;
        if (typeof nextSynapseType === 'string' || nextSynapseType === null) {
          setSynapseType(nextSynapseType ?? null);
        }
      }

      if ('latencyMs' in msg) {
        const nextLatencyMs = msg.latencyMs;
        if (typeof nextLatencyMs === 'number' || nextLatencyMs === null) {
          setLatencyMs(nextLatencyMs ?? null);
        }
      }

      if ('transcription' in msg) {
        const nextTranscription = msg.transcription;
        if (nextTranscription === null) setTranscription(null);
        else if (isTranscriptionResult(nextTranscription)) setTranscription(nextTranscription);
      }
    };
  }, [wsUrl]);

  useEffect(() => {
    if (!enabled) {
      destroyedRef.current = false;

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      wsRef.current?.close();
      wsRef.current = null;

      setConnected(false);
      setState(null);
      setKernelConfig(null);
      setOsControlState(null);
      setMachineState(null);
      setSynapseType(null);
      setLatencyMs(null);
      setTranscription(null);

      return;
    }
    destroyedRef.current = false;
    connect();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [connect, enabled]);

  return {
    connected,
    state,
    kernelConfig,
    osControlState,
    machineState,
    synapseType,
    latencyMs,
    transcription,
  };
}

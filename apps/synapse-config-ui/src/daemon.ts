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

function buildDaemonWsUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('role')) url.searchParams.set('role', 'ui');
    return url.toString();
  } catch {
    const fallback = new URL('ws://localhost:4040/ws');
    fallback.searchParams.set('role', 'ui');
    return fallback.toString();
  }
}

function getDaemonWsUrl(): string {
  if (typeof window === 'undefined') return buildDaemonWsUrl('ws://localhost:4040/ws');
  const params = new URLSearchParams(window.location.search);
  const override = params.get('ws');
  const raw = override ?? 'ws://localhost:4040/ws';
  return buildDaemonWsUrl(raw);
}

export function useDaemonWs(options?: { enabled?: boolean }): DaemonState {
  const enabled = options?.enabled ?? true;
  const wsUrl = useMemo(() => getDaemonWsUrl(), []);

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
    if (!enabled) return;
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

      if (reconnectTimeoutRef.current === null) {
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

      if (reconnectTimeoutRef.current === null) {
        reconnectTimeoutRef.current = window.setTimeout(connect, 1_750);
      }
    };

    ws.onmessage = (event) => {
      let msg: DaemonMessage;
      try {
        msg = JSON.parse(event.data as string) as DaemonMessage;
      } catch {
        return;
      }

      if (msg.type !== 'STATE_UPDATE') return;
      if (msg.state) setState(msg.state);
      if (msg.kernelConfig) setKernelConfig(msg.kernelConfig);
      if (msg.osControlState) setOsControlState(msg.osControlState);
      if (msg.machineState) setMachineState(msg.machineState);
      if (msg.synapseType) setSynapseType(msg.synapseType);
      if (msg.latencyMs !== undefined) setLatencyMs(msg.latencyMs);
      if (msg.transcription) setTranscription(msg.transcription);
    };
  }, [enabled, wsUrl]);

  useEffect(() => {
    if (!enabled) return;

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

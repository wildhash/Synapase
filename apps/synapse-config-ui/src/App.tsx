import { useState, useEffect, useCallback, useRef } from 'react';
import type { SynapseState } from '@synapse/hardware-events';

const DAEMON_WS_URL = 'ws://localhost:4040/ws';

interface DaemonMessage {
  type: string;
  state?: SynapseState;
  kernelConfig?: {
    computeMixWeight: number;
    contextWindowTokens: number;
    primaryModel: string;
  };
  latencyMs?: number;
  timestamp?: number;
}

function App() {
  const [state, setState] = useState<SynapseState | null>(null);
  const [kernelConfig, setKernelConfig] = useState<DaemonMessage['kernelConfig'] | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(DAEMON_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 2_000);
    };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as DaemonMessage;
        if (msg.type === 'STATE_UPDATE') {
          if (msg.state) setState(msg.state);
          if (msg.kernelConfig) setKernelConfig(msg.kernelConfig);
          if (msg.latencyMs !== undefined) setLatencyMs(msg.latencyMs);
        }
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return (
    <div style={{ fontFamily: 'monospace', padding: '2rem', background: '#0a0a0a', color: '#e0e0e0', minHeight: '100vh' }}>
      <h1 style={{ color: '#7c3aed' }}>⚡ Project Synapse</h1>
      <p style={{ color: connected ? '#22c55e' : '#ef4444' }}>
        Daemon: {connected ? '● Connected' : '○ Disconnected'}
      </p>

      {state && (
        <section>
          <h2>Synapse State</h2>
          <table>
            <tbody>
              <tr><td>Clutch</td><td>{state.isClutchEngaged ? '🔴 ENGAGED' : '⚪ IDLE'}</td></tr>
              <tr><td>Agent</td><td>{state.activeAgentContext}</td></tr>
              <tr><td>Voice</td><td>{state.voicePipelineStatus}</td></tr>
              <tr><td>Compute Mix</td><td>{(state.computeMixWeight * 100).toFixed(0)}% Cloud</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {kernelConfig && (
        <section>
          <h2>Kernel Mixer</h2>
          <table>
            <tbody>
              <tr><td>Primary Model</td><td>{kernelConfig.primaryModel}</td></tr>
              <tr><td>Context Window</td><td>{(kernelConfig.contextWindowTokens / 1000).toFixed(0)}k tokens</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {latencyMs !== null && (
        <p style={{ color: latencyMs < 50 ? '#22c55e' : '#f59e0b' }}>
          Last event latency: {latencyMs.toFixed(3)}ms {latencyMs < 50 ? '✓' : '⚠ >50ms'}
        </p>
      )}
    </div>
  );
}

export default App;

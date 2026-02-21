import {
  LogiHardwareEventSchema,
  type LogiHardwareEvent,
  type SynapseState,
} from '@synapse/hardware-events';

// ─── Plugin Config ────────────────────────────────────────────────────────────

const DAEMON_WS_URL = process.env['SYNAPSE_DAEMON_URL'] ?? 'ws://localhost:4040/ws';
const RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ─── Plugin State ─────────────────────────────────────────────────────────────

export interface PluginState {
  connected: boolean;
  reconnectAttempts: number;
  lastState: SynapseState | null;
}

// ─── WebSocket Client Factory ─────────────────────────────────────────────────

export type WsFactory = (url: string) => WebSocketLike;

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
}

// ─── Logi Actions Plugin ──────────────────────────────────────────────────────

/**
 * Logitech Options+ Actions SDK Plugin.
 * Listens to hardware events from Logitech SDK and forwards them to
 * synapse-core-daemon via WebSocket at ws://localhost:4040/ws.
 *
 * Dead-man switch: on daemon disconnect, plugin defaults back to
 * standard hardware behaviour by ceasing to intercept events.
 */
export class LogiActionsPlugin {
  private ws: WebSocketLike | null = null;
  private state: PluginState = {
    connected: false,
    reconnectAttempts: 0,
    lastState: null,
  };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly wsFactory: WsFactory;
  private destroyed = false;

  constructor(wsFactory: WsFactory) {
    this.wsFactory = wsFactory;
  }

  getState(): Readonly<PluginState> {
    return { ...this.state };
  }

  /** Connect to synapse-core-daemon WebSocket */
  connect(): void {
    if (this.destroyed) return;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const ws = this.wsFactory(DAEMON_WS_URL);
    const previousWs = this.ws;
    this.ws = ws;
    previousWs?.close();

    ws.onopen = () => {
      if (this.destroyed || this.ws !== ws) return;

      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.state = { ...this.state, connected: true, reconnectAttempts: 0 };
    };

    ws.onmessage = (event) => {
      if (this.destroyed || this.ws !== ws) return;
      try {
        const msg = JSON.parse(event.data) as { type: string; state?: SynapseState };
        if (msg.type === 'STATE_UPDATE' && msg.state) {
          this.state = { ...this.state, lastState: msg.state };
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (this.destroyed || this.ws !== ws) return;
      this.state = { ...this.state, connected: false };
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      if (this.destroyed || this.ws !== ws) return;
      // Dead-man switch: on error, ensure we're flagged disconnected
      this.state = { ...this.state, connected: false };
    };
  }

  /** Forward a hardware event to the daemon */
  sendHardwareEvent(event: LogiHardwareEvent): void {
    if (!this.state.connected || !this.ws) {
      // Dead-man switch: daemon unreachable, do nothing (hardware defaults apply)
      return;
    }
    try {
      LogiHardwareEventSchema.parse(event); // validate before sending
      this.ws.send(JSON.stringify(event));
    } catch {
      // Swallow validation errors — invalid events are not forwarded
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer !== null) return;
    if (this.state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed) return;

      const nextAttempts = this.state.reconnectAttempts + 1;
      if (nextAttempts > MAX_RECONNECT_ATTEMPTS) return;

      this.state = {
        ...this.state,
        reconnectAttempts: nextAttempts,
      };
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  /** Clean shutdown */
  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.state = { ...this.state, connected: false, reconnectAttempts: 0 };
  }
}

import { LogiActionsPlugin, type WebSocketLike } from './plugin';
import type { LogiHardwareEvent } from '@synapse/hardware-events';

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

function makeMockWs(): WebSocketLike & {
  sentMessages: string[];
  simulateOpen(): void;
  simulateMessage(data: string): void;
  simulateClose(): void;
} {
  const ws = {
    sentMessages: [] as string[],
    readyState: 0,
    onopen: null as ((event: unknown) => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null as ((event: unknown) => void) | null,
    onerror: null as ((event: unknown) => void) | null,
    send(data: string) {
      ws.sentMessages.push(data);
    },
    close() {
      ws.readyState = 3;
    },
    simulateOpen() {
      ws.readyState = 1;
      ws.onopen?.(null);
    },
    simulateMessage(data: string) {
      ws.onmessage?.({ data });
    },
    simulateClose() {
      ws.readyState = 3;
      ws.onclose?.(null);
    },
  };
  return ws;
}

describe('LogiActionsPlugin', () => {
  it('starts disconnected', () => {
    const plugin = new LogiActionsPlugin(() => makeMockWs());
    expect(plugin.getState().connected).toBe(false);
  });

  it('marks connected after WebSocket open', () => {
    let capturedWs: ReturnType<typeof makeMockWs> | null = null;
    const plugin = new LogiActionsPlugin((url) => {
      capturedWs = makeMockWs();
      return capturedWs;
    });

    plugin.connect();
    capturedWs!.simulateOpen();

    expect(plugin.getState().connected).toBe(true);
    plugin.destroy();
  });

  it('sends a validated hardware event when connected', () => {
    let capturedWs: ReturnType<typeof makeMockWs> | null = null;
    const plugin = new LogiActionsPlugin(() => {
      capturedWs = makeMockWs();
      return capturedWs;
    });

    plugin.connect();
    capturedWs!.simulateOpen();

    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_MASTER_4',
      componentId: 'ACTIONS_RING',
      eventType: 'PRESS',
    };
    plugin.sendHardwareEvent(event);

    expect(capturedWs!.sentMessages).toHaveLength(1);
    expect(JSON.parse(capturedWs!.sentMessages[0]!)).toMatchObject({
      deviceId: 'MX_MASTER_4',
      componentId: 'ACTIONS_RING',
      eventType: 'PRESS',
    });
    plugin.destroy();
  });

  it('does not send events when disconnected (dead-man switch)', () => {
    let capturedWs: ReturnType<typeof makeMockWs> | null = null;
    const plugin = new LogiActionsPlugin(() => {
      capturedWs = makeMockWs();
      return capturedWs;
    });

    plugin.connect();
    // Don't call simulateOpen — stays disconnected

    const event: LogiHardwareEvent = {
      timestamp: Date.now(),
      deviceId: 'MX_MASTER_4',
      componentId: 'ACTIONS_RING',
      eventType: 'PRESS',
    };
    plugin.sendHardwareEvent(event);
    expect(capturedWs!.sentMessages).toHaveLength(0);
    plugin.destroy();
  });

  it('updates lastState from STATE_UPDATE messages', () => {
    let capturedWs: ReturnType<typeof makeMockWs> | null = null;
    const plugin = new LogiActionsPlugin(() => {
      capturedWs = makeMockWs();
      return capturedWs;
    });

    plugin.connect();
    capturedWs!.simulateOpen();

    capturedWs!.simulateMessage(
      JSON.stringify({
        type: 'STATE_UPDATE',
        state: {
          isClutchEngaged: true,
          activeAgentContext: 'CODER',
          computeMixWeight: 0.7,
          voicePipelineStatus: 'LISTENING',
        },
      }),
    );

    expect(plugin.getState().lastState?.isClutchEngaged).toBe(true);
    plugin.destroy();
  });

  it('marks disconnected on WebSocket close', () => {
    let capturedWs: ReturnType<typeof makeMockWs> | null = null;
    const plugin = new LogiActionsPlugin(() => {
      capturedWs = makeMockWs();
      return capturedWs;
    });

    plugin.connect();
    capturedWs!.simulateOpen();
    expect(plugin.getState().connected).toBe(true);

    capturedWs!.simulateClose();
    expect(plugin.getState().connected).toBe(false);
    plugin.destroy();
  });

  it('drops invalid hardware events silently', () => {
    let capturedWs: ReturnType<typeof makeMockWs> | null = null;
    const plugin = new LogiActionsPlugin(() => {
      capturedWs = makeMockWs();
      return capturedWs;
    });

    plugin.connect();
    capturedWs!.simulateOpen();

    // @ts-expect-error intentionally invalid
    plugin.sendHardwareEvent({ deviceId: 'INVALID' });
    expect(capturedWs!.sentMessages).toHaveLength(0);
    plugin.destroy();
  });
});

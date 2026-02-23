import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { SocketStream } from '@fastify/websocket';
import { WebSocket } from 'ws';
import {
  LogiHardwareEventSchema,
  mapHardwareEventToSynapseType,
  type LogiHardwareEvent,
} from '@synapse/hardware-events';
import {
  MockKernelMixer,
  dialDeltaToComputeWeight,
  dialDeltaToContextTokens,
} from '@synapse/symbios-connector';
import { MockVoicePipeline, type TranscriptionResult } from '@synapse/voice-pipeline';
import {
  MockUiExecutorBridge,
  keypadToPersona,
  type AgentPersona,
  type OsControlState,
} from '@synapse/ui-executor-bridge';
import { SynapseMachine } from './stateMachine.js';
import { logger } from './logger.js';

// ─── Daemon State ─────────────────────────────────────────────────────────────

const machine = new SynapseMachine();
const kernelMixer = new MockKernelMixer();
const voicePipeline = new MockVoicePipeline();
const uiBridge = new MockUiExecutorBridge();

const DEMO_TRANSCRIPTION_ENABLED = process.env['SYNAPSE_DEMO_TRANSCRIPTION'] === '1';
let demoTranscriptionTimeouts: Array<NodeJS.Timeout> = [];

function clearDemoTranscription(): void {
  for (const t of demoTranscriptionTimeouts) clearTimeout(t);
  demoTranscriptionTimeouts = [];
}

function scheduleDemoTranscription(): void {
  if (!DEMO_TRANSCRIPTION_ENABLED) return;
  clearDemoTranscription();

  const partialDelayMs = 220;
  const finalDelayMs = 540;
  const processingDelayMs = 680;

  demoTranscriptionTimeouts.push(
    setTimeout(() => {
      voicePipeline.simulateTranscription('Navigate to the repository and initialize', false);
    }, partialDelayMs),
  );

  demoTranscriptionTimeouts.push(
    setTimeout(() => {
      voicePipeline.simulateTranscription(
        'Navigate to the repository and initialize a new branch.',
        true,
      );
    }, finalDelayMs),
  );

  demoTranscriptionTimeouts.push(
    setTimeout(() => {
      if (machine.getState() === 'CLUTCH_ENGAGED') {
        machine.send({ type: 'VOICE_READY' });
      }
    }, processingDelayMs),
  );
}

// Connected WebSocket clients (Logi plugin + config UI)
const clients = new Set<WebSocket>();
let lastTranscription: TranscriptionResult | null = null;

function getOsControlState(): OsControlState {
  return uiBridge.getControlState();
}

voicePipeline.onTranscription((result) => {
  lastTranscription = result;
  broadcast({
    type: 'STATE_UPDATE',
    state: machine.getData(),
    kernelConfig: kernelMixer.getConfig(),
    osControlState: getOsControlState(),
    transcription: result,
    timestamp: Date.now(),
  });
});

function broadcast(payload: unknown): void {
  const msg = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) {
      clients.delete(client);
      continue;
    }

    try {
      client.send(msg);
    } catch {
      clients.delete(client);
    }
  }
}

// ─── Hardware Event Processor ─────────────────────────────────────────────────

async function processHardwareEvent(event: LogiHardwareEvent): Promise<void> {
  const receiveTime = process.hrtime.bigint();
  logger.info({ event }, 'hardware event received');

  const synapseType = mapHardwareEventToSynapseType(event);
  if (!synapseType) {
    logger.debug({ event }, 'no synapse mapping for event');
    return;
  }

  const persona = uiBridge.getActivePersona() as AgentPersona;

  switch (synapseType) {
    case 'SYNAPSE_CLUTCH_ENGAGE': {
      machine.send({ type: 'CLUTCH_ENGAGE', persona });
      await voicePipeline.engage();
      await uiBridge.engage({
        type: 'ENGAGE',
        timestamp: event.timestamp,
        agentPersona: persona,
      });
      scheduleDemoTranscription();
      logger.info({ persona }, 'clutch engaged');
      break;
    }

    case 'SYNAPSE_CLUTCH_RELEASE': {
      // Priority 0 Interrupt — HARD STOP
      machine.send({ type: 'CLUTCH_RELEASE' });
      clearDemoTranscription();
      await voicePipeline.release();
      await uiBridge.release({
        type: 'RELEASE',
        timestamp: event.timestamp,
        agentPersona: persona,
      });
      logger.info('clutch released — OS control restored');
      break;
    }

    case 'SYNAPSE_DIAL_COMPUTE_MIX': {
      const delta = typeof event.value === 'number' ? event.value : 0;
      const newWeight = dialDeltaToComputeWeight(kernelMixer.getConfig().computeMixWeight, delta);
      kernelMixer.setComputeMix(newWeight);
      machine.send({ type: 'DIAL_COMPUTE', delta });
      logger.info({ newWeight }, 'compute mix updated');
      break;
    }

    case 'SYNAPSE_DIAL_CONTEXT_WINDOW': {
      const delta = typeof event.value === 'number' ? event.value : 0;
      const newTokens = dialDeltaToContextTokens(
        kernelMixer.getConfig().contextWindowTokens,
        delta,
      );
      kernelMixer.setContextWindow(newTokens);
      logger.info({ newTokens }, 'context window updated');
      break;
    }

    case 'SYNAPSE_KEYPAD_CONTEXT_SWITCH': {
      const key = typeof event.value === 'number' ? event.value : 0;
      const switchPersona = keypadToPersona(key);
      if (switchPersona) {
        machine.send({ type: 'KEYPAD_SWITCH', persona: switchPersona });
        uiBridge.switchPersona(switchPersona);
        logger.info({ switchPersona }, 'agent persona switched');
      }
      break;
    }
  }

  const latencyNs = process.hrtime.bigint() - receiveTime;
  const latencyMs = Number(latencyNs) / 1_000_000;
  logger.info({ latencyMs, synapseType }, 'event processed');

  broadcast({
    type: 'STATE_UPDATE',
    synapseType,
    machineState: machine.getState(),
    state: machine.getData(),
    kernelConfig: kernelMixer.getConfig(),
    osControlState: getOsControlState(),
    latencyMs,
    timestamp: Date.now(),
    transcription: lastTranscription,
  });
}

// ─── Fastify Server ───────────────────────────────────────────────────────────

export function buildServer() {
  const app = Fastify({ logger: false });

  app.register(fastifyWebsocket);

  app.register(async (fastify) => {
    /** Logitech plugin and config UI connect here */
    fastify.get('/ws', { websocket: true }, (connection: SocketStream, req: FastifyRequest) => {
      const socket = connection.socket;

      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const role = url.searchParams.get('role') ?? 'viewer';
      const token = url.searchParams.get('token');
      const configuredToken = process.env['SYNAPSE_WS_TOKEN'];
      const isTokenConfigured = Boolean(configuredToken);
      const isPlugin = role === 'plugin';
      const canSendEvents = isPlugin && (!isTokenConfigured || token === configuredToken);

      if (isPlugin && isTokenConfigured && !canSendEvents) {
        logger.warn('plugin connection rejected: invalid SYNAPSE_WS_TOKEN');
        try {
          socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid token' }));
        } catch {
          // ignore
        }
        socket.close();
        return;
      }

      clients.add(socket);
      logger.info({ clientCount: clients.size, role }, 'client connected');

      let inboundEventQueue: Promise<void> = Promise.resolve();
      let isClosed = false;

      // Send current state on connect
      socket.send(
        JSON.stringify({
          type: 'STATE_UPDATE',
          machineState: machine.getState(),
          state: machine.getData(),
          kernelConfig: kernelMixer.getConfig(),
          osControlState: getOsControlState(),
          timestamp: Date.now(),
          transcription: lastTranscription,
        }),
      );

      if (canSendEvents) {
        connection.on('message', (raw) => {
          if (isClosed) return;

          let event: LogiHardwareEvent;
          try {
            const payload = JSON.parse(raw.toString()) as unknown;
            event = LogiHardwareEventSchema.parse(payload);
          } catch (err) {
            logger.warn({ err }, 'invalid message received');
            try {
              socket.send(
                JSON.stringify({ type: 'ERROR', message: 'Invalid hardware event payload' }),
              );
            } catch {
              // ignore
            }
            return;
          }

          inboundEventQueue = inboundEventQueue
            .then(() => processHardwareEvent(event))
            .catch((err) => {
              logger.error({ err }, 'failed to process hardware event');
              try {
                socket.send(
                  JSON.stringify({ type: 'ERROR', message: 'Failed to process hardware event' }),
                );
              } catch {
                // ignore
              }
            });
        });
      }

      connection.on('close', () => {
        isClosed = true;
        inboundEventQueue = Promise.resolve();

        clients.delete(socket);
        logger.info({ clientCount: clients.size, role }, 'client disconnected');

        // Dead-man switch: if all clients disconnected, release clutch
        if (clients.size === 0 && machine.getData().isClutchEngaged) {
          logger.warn('dead-man switch triggered — releasing clutch');
          const ts = Date.now();
          const deadPersona = uiBridge.getActivePersona();
          machine.send({ type: 'CLUTCH_RELEASE' });
          clearDemoTranscription();
          void voicePipeline.release();
          void uiBridge.release({ type: 'RELEASE', timestamp: ts, agentPersona: deadPersona });
        }
      });
    });

    /** Health endpoint */
    fastify.get('/health', async () => ({
      status: 'ok',
      state: machine.getData(),
      kernelConfig: kernelMixer.getConfig(),
      timestamp: Date.now(),
    }));
  });

  return app;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

if (process.env['NODE_ENV'] !== 'test') {
  const PORT = Number(process.env['PORT'] ?? 4040);

  const server = buildServer();
  server.listen({ port: PORT, host: '127.0.0.1' }, (err, address) => {
    if (err) {
      logger.error(err, 'failed to start server');
      process.exit(1);
    }
    logger.info({ address }, 'synapse-core-daemon started');
  });
}

import { z } from 'zod';

// ─── Voice Pipeline Status ────────────────────────────────────────────────────

export type VoicePipelineStatus = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'ERROR';

// ─── LiveKit Connection Config ────────────────────────────────────────────────

export const LiveKitConfigSchema = z.object({
  /** WebSocket URL for the LiveKit server */
  serverUrl: z.string().url(),
  /** JWT access token for the room */
  accessToken: z.string().min(1),
  /** Room name to join */
  roomName: z.string().min(1),
});
export type LiveKitConfig = z.infer<typeof LiveKitConfigSchema>;

// ─── Deepgram Transcription Config ───────────────────────────────────────────

export const DeepgramConfigSchema = z.object({
  /** Deepgram WebSocket URL */
  wsUrl: z.string().url(),
  /** Deepgram API key */
  apiKey: z.string().min(1),
  /** Audio encoding format */
  encoding: z.enum(['linear16', 'flac', 'mulaw', 'amr-nb', 'opus']).default('linear16'),
  /** Sample rate in Hz */
  sampleRate: z.number().int().positive().default(16_000),
  /** Language for transcription */
  language: z.string().default('en-US'),
});
export type DeepgramConfig = z.infer<typeof DeepgramConfigSchema>;

// ─── Transcription Result ─────────────────────────────────────────────────────

export const TranscriptionResultSchema = z.object({
  transcript: z.string(),
  isFinal: z.boolean(),
  confidence: z.number().min(0).max(1),
  durationMs: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
});
export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;

// ─── Voice Pipeline Interface ────────────────────────────────────────────────

export interface IVoicePipeline {
  getStatus(): VoicePipelineStatus;
  /** Called when clutch is engaged: unmutes mic and opens WebSocket */
  engage(): Promise<void>;
  /** Called when clutch is released: mutes mic and closes connection */
  release(): Promise<void>;
  onTranscription(handler: (result: TranscriptionResult) => void): void;
}

// ─── Mock VoicePipeline ───────────────────────────────────────────────────────

/**
 * Mock implementation of the voice pipeline for development and testing.
 * Replace with real @tinywindow/difficult-ai LiveKit/Deepgram integration.
 */
export class MockVoicePipeline implements IVoicePipeline {
  private status: VoicePipelineStatus = 'IDLE';
  private transcriptionHandlers: Array<(result: TranscriptionResult) => void> = [];

  getStatus(): VoicePipelineStatus {
    return this.status;
  }

  async engage(): Promise<void> {
    if (this.status === 'LISTENING') return;
    this.status = 'LISTENING';
    // In real impl: connect to LiveKit room, open Deepgram WebSocket, unmute mic
  }

  async release(): Promise<void> {
    if (this.status === 'IDLE') return;
    this.status = 'IDLE';
    // In real impl: mute mic, close Deepgram WebSocket, disconnect from LiveKit room
  }

  onTranscription(handler: (result: TranscriptionResult) => void): void {
    this.transcriptionHandlers.push(handler);
  }

  /** Test helper: simulate a transcription event */
  simulateTranscription(transcript: string, isFinal = true): void {
    const result: TranscriptionResult = {
      transcript,
      isFinal,
      confidence: 0.95,
      durationMs: 500,
      timestamp: Date.now(),
    };
    for (const handler of this.transcriptionHandlers) {
      handler(result);
    }
  }
}

/**
 * Builds the LiveKit WebSocket initialization string for @tinywindow/difficult-ai.
 */
export function buildLiveKitWsUrl(config: LiveKitConfig): string {
  const url = new URL(config.serverUrl);
  url.searchParams.set('access_token', config.accessToken);
  url.searchParams.set('room', config.roomName);
  return url.toString();
}

/**
 * Builds the Deepgram WebSocket initialization string.
 */
export function buildDeepgramWsUrl(config: DeepgramConfig): string {
  const base = config.wsUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    encoding: config.encoding,
    sample_rate: config.sampleRate.toString(),
    language: config.language,
  });
  return `${base}?${params.toString()}`;
}

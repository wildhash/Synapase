import {
  MockVoicePipeline,
  buildLiveKitWsUrl,
  buildDeepgramWsUrl,
  LiveKitConfigSchema,
  DeepgramConfigSchema,
  TranscriptionResultSchema,
} from './index';

describe('LiveKitConfigSchema', () => {
  it('validates a valid config', () => {
    expect(() =>
      LiveKitConfigSchema.parse({
        serverUrl: 'wss://livekit.example.com',
        accessToken: 'tok_abc123',
        roomName: 'synapse-room',
      }),
    ).not.toThrow();
  });

  it('rejects an invalid URL', () => {
    expect(() =>
      LiveKitConfigSchema.parse({
        serverUrl: 'not-a-url',
        accessToken: 'tok_abc123',
        roomName: 'synapse-room',
      }),
    ).toThrow();
  });
});

describe('DeepgramConfigSchema', () => {
  it('validates a config with defaults', () => {
    const config = DeepgramConfigSchema.parse({
      wsUrl: 'wss://api.deepgram.com/v1/listen',
      apiKey: 'dg_abc123',
    });
    expect(config.encoding).toBe('linear16');
    expect(config.sampleRate).toBe(16_000);
    expect(config.language).toBe('en-US');
  });
});

describe('buildLiveKitWsUrl', () => {
  it('builds a valid WebSocket URL with params', () => {
    const config = LiveKitConfigSchema.parse({
      serverUrl: 'wss://livekit.example.com',
      accessToken: 'tok_abc123',
      roomName: 'synapse-room',
    });
    const url = buildLiveKitWsUrl(config);
    expect(url).toContain('access_token=tok_abc123');
    expect(url).toContain('room=synapse-room');
  });
});

describe('buildDeepgramWsUrl', () => {
  it('builds a valid Deepgram WebSocket URL', () => {
    const config = DeepgramConfigSchema.parse({
      wsUrl: 'wss://api.deepgram.com/v1/listen',
      apiKey: 'dg_abc123',
    });
    const url = buildDeepgramWsUrl(config);
    expect(url).toContain('encoding=linear16');
    expect(url).toContain('sample_rate=16000');
    expect(url).toContain('language=en-US');
  });
});

describe('MockVoicePipeline', () => {
  it('starts in IDLE state', () => {
    const pipeline = new MockVoicePipeline();
    expect(pipeline.getStatus()).toBe('IDLE');
  });

  it('transitions to LISTENING on engage', async () => {
    const pipeline = new MockVoicePipeline();
    await pipeline.engage();
    expect(pipeline.getStatus()).toBe('LISTENING');
  });

  it('transitions back to IDLE on release', async () => {
    const pipeline = new MockVoicePipeline();
    await pipeline.engage();
    await pipeline.release();
    expect(pipeline.getStatus()).toBe('IDLE');
  });

  it('is idempotent: engage while already LISTENING', async () => {
    const pipeline = new MockVoicePipeline();
    await pipeline.engage();
    await pipeline.engage();
    expect(pipeline.getStatus()).toBe('LISTENING');
  });

  it('fires transcription handlers', async () => {
    const pipeline = new MockVoicePipeline();
    await pipeline.engage();

    const results: string[] = [];
    pipeline.onTranscription((r) => results.push(r.transcript));
    pipeline.simulateTranscription('Hello Synapse');

    expect(results).toHaveLength(1);
    expect(results[0]).toBe('Hello Synapse');
  });

  it('validates transcription result schema', () => {
    expect(() =>
      TranscriptionResultSchema.parse({
        transcript: 'test',
        isFinal: true,
        confidence: 0.9,
        durationMs: 100,
        timestamp: Date.now(),
      }),
    ).not.toThrow();
  });
});

import {
  MockKernelMixer,
  selectModel,
  dialDeltaToComputeWeight,
  dialDeltaToContextTokens,
  KernelMixConfigSchema,
} from './index';

describe('selectModel', () => {
  it('returns LOCAL_LLAMA3 for weight below 0.5', () => {
    expect(selectModel(0.0)).toBe('LOCAL_LLAMA3');
    expect(selectModel(0.4)).toBe('LOCAL_LLAMA3');
  });

  it('returns CLOUD_CLAUDE_3_5_SONNET for weight >= 0.5', () => {
    expect(selectModel(0.5)).toBe('CLOUD_CLAUDE_3_5_SONNET');
    expect(selectModel(1.0)).toBe('CLOUD_CLAUDE_3_5_SONNET');
  });
});

describe('dialDeltaToComputeWeight', () => {
  it('increases weight with positive delta', () => {
    const result = dialDeltaToComputeWeight(0.5, 2);
    expect(result).toBeCloseTo(0.6, 5);
  });

  it('decreases weight with negative delta', () => {
    const result = dialDeltaToComputeWeight(0.5, -2);
    expect(result).toBeCloseTo(0.4, 5);
  });

  it('clamps to [0, 1]', () => {
    expect(dialDeltaToComputeWeight(0.0, -10)).toBe(0);
    expect(dialDeltaToComputeWeight(1.0, 10)).toBe(1);
  });
});

describe('dialDeltaToContextTokens', () => {
  it('increases tokens with positive delta', () => {
    expect(dialDeltaToContextTokens(32_000, 1)).toBe(38_000);
  });

  it('decreases tokens with negative delta', () => {
    expect(dialDeltaToContextTokens(32_000, -2)).toBe(20_000);
  });

  it('clamps to [8000, 128000]', () => {
    expect(dialDeltaToContextTokens(8_000, -5)).toBe(8_000);
    expect(dialDeltaToContextTokens(128_000, 5)).toBe(128_000);
  });
});

describe('MockKernelMixer', () => {
  it('initializes with default config', () => {
    const mixer = new MockKernelMixer();
    const config = mixer.getConfig();
    expect(config.computeMixWeight).toBe(0.5);
    expect(config.contextWindowTokens).toBe(32_000);
  });

  it('updates compute mix weight and selects correct model', () => {
    const mixer = new MockKernelMixer();
    mixer.setComputeMix(0.8);
    const config = mixer.getConfig();
    expect(config.computeMixWeight).toBe(0.8);
    expect(config.primaryModel).toBe('CLOUD_CLAUDE_3_5_SONNET');
  });

  it('clamps compute mix to [0, 1]', () => {
    const mixer = new MockKernelMixer();
    mixer.setComputeMix(2.0);
    expect(mixer.getConfig().computeMixWeight).toBe(1);
    mixer.setComputeMix(-1.0);
    expect(mixer.getConfig().computeMixWeight).toBe(0);
  });

  it('updates context window tokens', () => {
    const mixer = new MockKernelMixer();
    mixer.setContextWindow(64_000);
    expect(mixer.getConfig().contextWindowTokens).toBe(64_000);
  });

  it('clamps context window to [8000, 128000]', () => {
    const mixer = new MockKernelMixer();
    mixer.setContextWindow(200_000);
    expect(mixer.getConfig().contextWindowTokens).toBe(128_000);
    mixer.setContextWindow(1_000);
    expect(mixer.getConfig().contextWindowTokens).toBe(8_000);
  });

  it('dispatches a mock response', async () => {
    const mixer = new MockKernelMixer();
    const response = await mixer.dispatch('Test prompt');
    expect(response.content).toContain('Test prompt');
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('validates config schema', () => {
    const valid = {
      computeMixWeight: 0.5,
      contextWindowTokens: 32_000,
      primaryModel: 'LOCAL_LLAMA3',
    };
    expect(() => KernelMixConfigSchema.parse(valid)).not.toThrow();
  });
});

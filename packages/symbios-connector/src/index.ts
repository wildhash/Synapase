import { z } from 'zod';

// ─── SymbiOS KernelMixer ──────────────────────────────────────────────────────

export const ComputeModelSchema = z.enum([
  'LOCAL_LLAMA3',
  'CLOUD_CLAUDE_3_5_SONNET',
  'CLOUD_GPT4O',
  'LOCAL_MISTRAL',
]);
export type ComputeModel = z.infer<typeof ComputeModelSchema>;

export const KernelMixConfigSchema = z.object({
  /** 0.0 = 100% local, 1.0 = 100% cloud */
  computeMixWeight: z.number().min(0).max(1),
  /** Token limit for context window (8k–128k) */
  contextWindowTokens: z.number().int().min(8_000).max(128_000),
  primaryModel: ComputeModelSchema,
  fallbackModel: ComputeModelSchema.optional(),
});
export type KernelMixConfig = z.infer<typeof KernelMixConfigSchema>;

export const KernelRequestSchema = z.object({
  requestId: z.string().uuid(),
  prompt: z.string().min(1),
  config: KernelMixConfigSchema,
  timestamp: z.number().int().positive(),
});
export type KernelRequest = z.infer<typeof KernelRequestSchema>;

export const KernelResponseSchema = z.object({
  requestId: z.string().uuid(),
  model: ComputeModelSchema,
  content: z.string(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
});
export type KernelResponse = z.infer<typeof KernelResponseSchema>;

// ─── KernelMixer ─────────────────────────────────────────────────────────────

/**
 * Mock interface for @tinywindow/symbios KernelMixer.
 * Routes LLM requests to local or cloud models based on computeMixWeight.
 */
export interface IKernelMixer {
  setComputeMix(weight: number): void;
  setContextWindow(tokens: number): void;
  getConfig(): KernelMixConfig;
  dispatch(prompt: string): Promise<KernelResponse>;
}

/**
 * Selects the appropriate model based on the compute mix weight.
 * Weight < 0.5 favors local; weight >= 0.5 favors cloud.
 */
export function selectModel(weight: number): ComputeModel {
  if (weight < 0.5) return 'LOCAL_LLAMA3';
  return 'CLOUD_CLAUDE_3_5_SONNET';
}

/**
 * Maps a dial delta (integer) to a new compute mix weight, clamped [0, 1].
 * Each tick is 0.05 change (20 ticks for full range).
 */
export function dialDeltaToComputeWeight(currentWeight: number, delta: number): number {
  const step = 0.05;
  return Math.min(1, Math.max(0, currentWeight + delta * step));
}

/**
 * Maps a dial delta to a context window token count.
 * Range: 8k–128k. Each tick represents ~6k tokens.
 */
export function dialDeltaToContextTokens(currentTokens: number, delta: number): number {
  const step = 6_000;
  return Math.min(128_000, Math.max(8_000, currentTokens + delta * step));
}

/**
 * Mock KernelMixer implementation for testing and development.
 * Replace with real @tinywindow/symbios integration.
 */
export class MockKernelMixer implements IKernelMixer {
  private config: KernelMixConfig;

  constructor(initial?: Partial<KernelMixConfig>) {
    this.config = KernelMixConfigSchema.parse({
      computeMixWeight: initial?.computeMixWeight ?? 0.5,
      contextWindowTokens: initial?.contextWindowTokens ?? 32_000,
      primaryModel: initial?.primaryModel ?? 'LOCAL_LLAMA3',
      fallbackModel: initial?.fallbackModel,
    });
  }

  setComputeMix(weight: number): void {
    this.config = {
      ...this.config,
      computeMixWeight: Math.min(1, Math.max(0, weight)),
      primaryModel: selectModel(weight),
    };
  }

  setContextWindow(tokens: number): void {
    this.config = {
      ...this.config,
      contextWindowTokens: Math.min(128_000, Math.max(8_000, tokens)),
    };
  }

  getConfig(): KernelMixConfig {
    return { ...this.config };
  }

  async dispatch(prompt: string): Promise<KernelResponse> {
    const start = Date.now();
    // Mock response — replace with real @tinywindow/symbios SDK call
    const response: KernelResponse = {
      requestId: crypto.randomUUID(),
      model: this.config.primaryModel,
      content: `[MOCK:${this.config.primaryModel}] Response to: ${prompt.slice(0, 50)}`,
      latencyMs: Date.now() - start,
      timestamp: Date.now(),
    };
    return KernelResponseSchema.parse(response);
  }
}

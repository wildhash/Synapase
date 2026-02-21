import { z } from 'zod';

// ─── Agent Persona ────────────────────────────────────────────────────────────

export const AgentPersonaSchema = z.enum(['CODER', 'NAVIGATOR', 'RESEARCHER']);
export type AgentPersona = z.infer<typeof AgentPersonaSchema>;

/** Maps keypad keys 1–4 to agent personas */
export const KEYPAD_PERSONA_MAP: Readonly<Record<number, AgentPersona>> = {
  1: 'CODER',
  2: 'NAVIGATOR',
  3: 'RESEARCHER',
} as const;

// ─── Clutch Event ─────────────────────────────────────────────────────────────

export const ClutchEventSchema = z.object({
  type: z.enum(['ENGAGE', 'RELEASE']),
  timestamp: z.number().int().positive(),
  agentPersona: AgentPersonaSchema,
});
export type ClutchEvent = z.infer<typeof ClutchEventSchema>;

// ─── OS Control State ─────────────────────────────────────────────────────────

export type OsControlOwner = 'PHYSICAL_MOUSE' | 'JAYU_AGENT';

export const OsControlStateSchema = z.object({
  owner: z.enum(['PHYSICAL_MOUSE', 'JAYU_AGENT']),
  handedOffAt: z.number().int().positive().optional(),
  activePersona: AgentPersonaSchema,
});
export type OsControlState = z.infer<typeof OsControlStateSchema>;

// ─── UI Executor Bridge Interface ────────────────────────────────────────────

export interface IUiExecutorBridge {
  getControlState(): OsControlState;
  getActivePersona(): AgentPersona;
  /** ENGAGE: pause OS cursor, hand control to Jayu agent */
  engage(event: ClutchEvent): Promise<void>;
  /** RELEASE (Priority 0 interrupt): hard stop all Jayu events, return OS cursor */
  release(event: ClutchEvent): Promise<void>;
  /** Switch active agent persona (keypad 1-4) */
  switchPersona(persona: AgentPersona): void;
}

// ─── Mock UiExecutorBridge ────────────────────────────────────────────────────

/**
 * Mock implementation of @tinywindow/jayu ClutchEvent API.
 * Replace with real Jayu SDK calls for OS-level cursor control.
 */
export class MockUiExecutorBridge implements IUiExecutorBridge {
  private state: OsControlState = {
    owner: 'PHYSICAL_MOUSE',
    activePersona: 'CODER',
  };

  getControlState(): OsControlState {
    return { ...this.state };
  }

  getActivePersona(): AgentPersona {
    return this.state.activePersona;
  }

  async engage(event: ClutchEvent): Promise<void> {
    if (this.state.owner === 'JAYU_AGENT') return;
    // Priority: validate event before handing control
    ClutchEventSchema.parse(event);
    this.state = {
      owner: 'JAYU_AGENT',
      handedOffAt: event.timestamp,
      activePersona: event.agentPersona,
    };
    // In real impl: call jayu.clutchEngage(event) -> pause OS mouse input
  }

  async release(event: ClutchEvent): Promise<void> {
    // Priority 0 interrupt — always execute regardless of current state
    ClutchEventSchema.parse(event);
    this.state = {
      owner: 'PHYSICAL_MOUSE',
      activePersona: event.agentPersona,
    };
    // In real impl: call jayu.clutchRelease(event) -> restore OS cursor IMMEDIATELY
  }

  switchPersona(persona: AgentPersona): void {
    AgentPersonaSchema.parse(persona);
    this.state = { ...this.state, activePersona: persona };
  }
}

/**
 * Maps a keypad press value (1-4) to the corresponding AgentPersona.
 * Returns undefined if the key has no mapping.
 */
export function keypadToPersona(key: number): AgentPersona | undefined {
  return KEYPAD_PERSONA_MAP[key];
}

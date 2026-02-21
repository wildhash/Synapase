# Project Synapse

> The physical control layer for deterministic UI agents and multi-LLM orchestration via Logitech Actions SDK.

**Company:** Tiny Window

---

## Architecture Overview

Project Synapse bridges Logitech MX ecosystem hardware to a multi-LLM AI operating system with deterministic UI agents, targeting **<50ms end-to-end latency**.

```
Logitech Hardware
  MX Master 4 (Agent Clutch)
  MX Creative Console (Kernel Mixer)
        │
        ▼ Logitech Options+ (Actions SDK)
  apps/logi-actions-plugin   ◄─── WebSocket client
        │
        ▼ ws://localhost:4040/ws
  apps/synapse-core-daemon   ◄─── Fastify + XState state machine
        │
        ├──► @tinywindow/symbios (KernelMixer)   [packages/symbios-connector]
        ├──► @tinywindow/difficult-ai (Voice)    [packages/voice-pipeline]
        └──► @tinywindow/jayu (UI Agent)         [packages/ui-executor-bridge]
        │
        ▼ ws://localhost:4040/ws
  apps/synapse-config-ui     ◄─── React/Vite dashboard
```

---

## Monorepo Structure

```
project-synapse/
├── pnpm-workspace.yaml
├── package.json                      # Root workspace scripts
├── tsconfig.base.json                # Shared TypeScript config
├── apps/
│   ├── logi-actions-plugin/          # Logitech Actions SDK plugin (TS)
│   ├── synapse-core-daemon/          # Fastify + XState local daemon
│   └── synapse-config-ui/            # React/Vite routing dashboard
├── packages/
│   ├── hardware-events/              # Zod schemas for hardware signals
│   ├── symbios-connector/            # SymbiOS multi-LLM kernel bridge
│   ├── voice-pipeline/               # LiveKit/Deepgram stream handlers
│   └── ui-executor-bridge/           # Jayu deterministic control API
└── scripts/
    └── package-plugin.mjs            # Packages plugin for Options+ install
```

---

## Hardware-to-State Mappings

### Device 1: MX Master 4 (The Agent Clutch)

| Event | Synapse Action | Pipeline |
|-------|---------------|----------|
| `ACTIONS_RING` PRESS/HOLD | `SYNAPSE_CLUTCH_ENGAGE` | Unmute mic → Open WebSocket → Pause OS cursor → Awaken Jayu agent |
| `ACTIONS_RING` RELEASE | `SYNAPSE_CLUTCH_RELEASE` (Priority 0) | Hard stop Jayu → Mute mic → Restore OS cursor immediately |

### Device 2: MX Creative Console (The Kernel Mixer)

| Event | Synapse Action | Effect |
|-------|---------------|--------|
| `DIAL_A` ROTATE | `SYNAPSE_DIAL_COMPUTE_MIX` | Adjust local↔cloud compute weight (0.0 = 100% Llama3, 1.0 = 100% Claude 3.5 Sonnet) |
| `DIAL_B` ROTATE | `SYNAPSE_DIAL_CONTEXT_WINDOW` | Scale context window tokens (8k → 128k) |
| `KEYPAD` PRESS 1 | `SYNAPSE_KEYPAD_CONTEXT_SWITCH` | Switch agent persona → **CODER** |
| `KEYPAD` PRESS 2 | `SYNAPSE_KEYPAD_CONTEXT_SWITCH` | Switch agent persona → **NAVIGATOR** |
| `KEYPAD` PRESS 3 | `SYNAPSE_KEYPAD_CONTEXT_SWITCH` | Switch agent persona → **RESEARCHER** |

---

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0

```bash
npm install -g pnpm
```

---

## Build & Test

```bash
# Install all workspace dependencies
pnpm install

# Build all packages and apps
pnpm build

# Run all tests (builds packages first)
pnpm test

# Type-check all packages
pnpm typecheck

# Start the core daemon in development mode (port 4040)
pnpm dev
```

### Running individual packages

```bash
pnpm --filter @synapse/hardware-events test
pnpm --filter synapse-core-daemon test
pnpm --filter @synapse/symbios-connector build
```

---

## Loading the Plugin into Logitech Options+

1. **Build the plugin:**
   ```bash
   pnpm --filter logi-actions-plugin build
   node scripts/package-plugin.mjs
   ```
   This creates `dist/logi-plugin-package/` with `manifest.json` and `plugin.js`.

2. **Start the core daemon:**
   ```bash
   pnpm dev
   # Daemon listens on ws://localhost:4040/ws
   ```

3. **Load in Logitech Options+:**
   - Open **Logitech Options+**
   - Go to **Settings → Plugin Developer**
   - Click **Load Unpacked Plugin**
   - Select the `dist/logi-plugin-package/` folder
   - Plugin ID: `com.tinywindow.project-synapse`

4. **Open the Config UI (optional):**
   ```bash
   pnpm --filter synapse-config-ui dev
   # Dashboard at http://localhost:5173
   ```

---

## Dead-Man Switch

If `synapse-core-daemon` crashes or becomes unreachable:
- The Logi plugin stops forwarding events — hardware defaults to standard Options+ behaviour
- No UI lockout can occur

If all WebSocket clients disconnect while the clutch is engaged, the daemon automatically emits a `CLUTCH_RELEASE` to restore OS cursor control.

---

## Latency Profiling

The daemon uses Pino with `process.hrtime.bigint()` for nanosecond-precision timestamps. Each processed event logs:

```json
{"time":"1234567890123456789","latencyMs":12.345,"synapseType":"SYNAPSE_CLUTCH_ENGAGE"}
```

Target: **<50ms** from hardware event to UI agent action.

---

## Packages

| Package | Description |
|---------|-------------|
| `@synapse/hardware-events` | Zod schemas + interfaces for `LogiHardwareEvent` and `SynapseState` |
| `@synapse/symbios-connector` | `MockKernelMixer` for `@tinywindow/symbios` compute mix routing |
| `@synapse/voice-pipeline` | `MockVoicePipeline` for `@tinywindow/difficult-ai` LiveKit/Deepgram |
| `@synapse/ui-executor-bridge` | `MockUiExecutorBridge` for `@tinywindow/jayu` ClutchEvent API |

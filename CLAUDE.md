# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`appium-agent-inspector` is a CLI + background daemon that lets an AI agent drive a
real iOS or Android app over Appium. It ships two binaries and a Claude skill:

| Binary | Entry point | Role |
| --- | --- | --- |
| `appium-agent` | `src/cli/index.ts` | Short-lived CLI. One process per command. |
| `appium-daemon` | `src/daemon/index.ts` | Long-lived HTTP server holding the Appium session. |

## Commands

```bash
npm run check          # lint + format:check + typecheck + test — run before every commit
npm test               # vitest
npm run test:coverage  # vitest with v8 coverage; enforces the thresholds in vitest.config.ts
npm run build          # clean + tsc -p tsconfig.build.json
npm run dev:cli -- <args>   # run the CLI from source
npm run dev:daemon          # run the daemon from source, watching for changes
```

CI (`.github/workflows/pr.yml`) runs lint, format:check, typecheck, `test:coverage`
and build on Node 22/24/26, plus a package-size gate. `npm run check` matches it
except for the build and the size gate.

## Architecture

**Why a daemon at all.** An Appium session takes ~30s to create and dies with the
process that owns it. Agents invoke one CLI command at a time, so the session has
to outlive any single command. The daemon owns it; the CLI is a thin HTTP client.

```
appium-agent <cmd>  ──HTTP──▶  appium-daemon  ──WebDriver──▶  Appium server ──▶ device
   src/cli/                      src/daemon/
```

**Layout.**

- `src/shared/` — used by both sides. `types.ts` holds every Zod schema and
  response type; `constants.ts` centralises ports, timeouts and paths;
  `errors.ts` defines `AppiumAgentError` and its subclasses.
- `src/cli/commands/*.command.ts` — one file per command, each exporting a
  `register<Name>(program)` function wired up in `src/cli/index.ts`.
- `src/daemon/routes/*.routes.ts` — Fastify route groups.
- `src/daemon/session-manager.ts` — owns the single WebdriverIO driver.
- `src/daemon/element-registry.ts` — maps stable element IDs to live elements.

## Conventions that matter here

**Errors carry their own HTTP status.** Throw an `AppiumAgentError` subclass from
`src/shared/errors.ts`. The daemon's single error handler in `src/daemon/server.ts`
maps it to a response, so routes contain no try/catch mapping blocks. Do not add
per-route error handling.

**Validation happens once, at the boundary.** Request bodies go through
`parseBody(Schema, request.body)` in `src/daemon/routes/helpers.ts`, which turns a
Zod failure into a 400. Add the schema to `src/shared/types.ts`, not inline.

**The CLI validates before it dials.** Flags that mirror a daemon bound (a
timeout, a swipe count) are checked in the command with `parseInteger`/`parseChoice`
from `src/cli/parse.ts`, so a bad flag fails instantly instead of after a round trip.
When a bound exists in both places, keep the two in sync.

**Every command supports `--json`.** Use `makeOutput(program)` and call
`out.emit(data, () => …human output…)`. Both formats live at one call site so they
cannot drift apart. Agents read the JSON; humans read the text.

**Element targeting is shared.** Element-facing commands call `addTargetOptions`
and `resolveTarget` from `src/cli/target.ts`, accepting either `--element-id` or
`--strategy` + `--selector` + `--index`.

**Runtime state lives in `~/.appium-agent/`**, never in the package directory
(global installs are read-only and wiped on reinstall). `daemon.json` holds the
pid, port and auth token at mode 0600; `daemon-start.lock` serialises concurrent
`daemon:start` calls.

**Strict TypeScript.** `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
are on. Build optional properties with `...(v !== undefined && { key: v })` rather
than assigning `undefined`, and handle the `undefined` that indexing yields.

## Testing

Tests live in `test/`, mirroring `src/`. Vitest, node environment, no globals
beyond the vitest imports.

- **Command tests** use the harness in `test/cli/commands/helpers.ts`. It registers
  the command on a real commander program — so option parsing, defaults and
  `--json` routing are genuinely exercised — and fakes only the `DaemonClient`
  boundary. Mock it per file with
  `vi.mock('../../../src/cli/daemon-client.js', () => ({ DaemonClient: { fromDaemonState: vi.fn() } }))`.
- **Daemon tests** build a real Fastify instance and use `server.inject()`.
- `src/cli/index.ts` and `src/daemon/index.ts` are excluded from coverage: they are
  process wiring (signals, listen, spawn), covered by `test/manual-smoke.md`.

Coverage thresholds are enforced in `vitest.config.ts` and are a floor, not a
target. Do not lower them to make a change pass.

## Publishing

`package.json` has a `files` allowlist — `dist`, `.claude/skills`, and the docs.
New assets that must ship need adding there. `.claude/skills/appium-agent/SKILL.md`
ships deliberately: `appium-agent install --skill` copies it into a user's project.
`prepublishOnly` rebuilds from clean, and both workflows fail if the unpacked
package exceeds 2 MB.

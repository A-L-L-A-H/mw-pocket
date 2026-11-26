# MoonWitness Pocket (`A-L-L-A-H/mw-pocket`)

Android-first (iOS-compatible) sovereign mobile companion for the MoonWitness Fleet built with **Expo (SDK 52) + React Native + TypeScript**.

## Capabilities

- **HQ & Fleet (`HqFleetScreen`)**: Live `mw-echo` status, Arena Level/XP/Streak HUD, 12+ service Fleet matrix, 1-tap Fleet Probe, and ARSY Merkle seal verification.
- **Shadow Sidekick (`SidekickScreen`)**: Mobile AI chat + Coding Agent mission launcher and run log monitor.
- **World Radar (`WorldRadarScreen`)**: P0/P1/P2 intelligence feed (IDX/BEI, USGS, CISA KEV, arXiv) with acknowledge actions.
- **Comms (`CommsScreen`)**: Unified WhatsApp (GOWA), Telegram, and Discord quick composer + channel health.
- **Bounty & Vault (`BountyVaultScreen`)**: Tap-to-advance Bounty Kanban, Disk Doctor gauges, and 1-tap 9Drive Backup trigger.
- **MyLove (`MyLoveScreen`)**: `A-L-L-A-H.COM` mobile companion — daily GOD PROMISE typographic/celestial cards (`CAN-0011`), AQEL Arabic root analyzer, and Antikythera M-Time clock.
- **Settings (`SettingsScreen`)**: QR code pairing (`mw-pocket://pair`), LAN/Cloudflare Tunnel endpoints, `mw-rid` OIDC PKCE `S256` SSO, and offline snapshot cache controls.

## Security & Canon Invariants

- **CAN-0011**: Zero visual depiction of Allah, Prophet Muhammad, or Isa/Yesus. Strictly typographic, geometric, and celestial crescent/orbit visuals enforced at runtime by `src/guards/canon.ts`.
- **ADR-001**: RFC 7636 PKCE `S256` only; rejects `alg: none` JWTs and missing OIDC issuers.

## Commands

```bash
bun install
bun run typecheck
bun test
bun run start
```

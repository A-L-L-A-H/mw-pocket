# mw-pocket — Android-first mobile companion for the MoonWitness fleet.

**Repository:** [`A-L-L-A-H/mw-pocket`](https://github.com/A-L-L-A-H/mw-pocket) · **Stack:** Expo SDK 52 · React Native · TypeScript

## What it does

Provides fleet HQ, AI sidekick, world radar, comms, bounty/vault, MyLove cards, and OIDC PKCE pairing with mw-rid.

## Quick start

```bash
bun install
bun run android
```

## Verify

```bash
bun run typecheck
bun test
```

## Configuration

- **Key configuration:** MW_ECHO_TOKEN for paired API calls

```bash
bun run start
bun run assets:generate
```

## Notes

iOS is compatible but Android is the primary target. Local APK build: .\scripts\build-apk-local.ps1.

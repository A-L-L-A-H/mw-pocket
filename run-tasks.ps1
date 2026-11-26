#!/usr/bin/env powershell
param([string]$Dir)

Write-Host "Changing to directory: $Dir"
Set-Location $Dir

Write-Host "Running bun install..."
bun install

Write-Host "Running bun typecheck..."
bun tsc --noEmit

Write-Host "Running bun test..."
bun test
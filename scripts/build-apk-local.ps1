param(
    [switch]$SkipPrebuild = $false,
    [string]$BuildType = "release"
)

$ErrorActionPreference = "Stop"

Write-Host "=== MW-POCKET LOCAL ANDROID APK BUILD PREFLIGHT ===" -ForegroundColor Cyan

# 1. Verify ANDROID_HOME / ANDROID_SDK_ROOT
$androidSdk = $env:ANDROID_HOME
if (-not $androidSdk -or -not (Test-Path $androidSdk)) {
    $androidSdk = $env:ANDROID_SDK_ROOT
}

if (-not $androidSdk -or -not (Test-Path $androidSdk)) {
    Write-Warning "ANDROID_HOME or ANDROID_SDK_ROOT is not set or directory does not exist: '$androidSdk'"
    Write-Warning "Please install Android SDK cmdline-tools & platforms or export ANDROID_HOME before local execution."
} else {
    Write-Host "[OK] ANDROID_HOME detected at: $androidSdk" -ForegroundColor Green
}

# 2. Verify Assets & CAN-0011 PNGs
$pocketDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$assetsDir = Join-Path $pocketDir "assets"

$requiredAssets = @("icon.png", "adaptive-icon.png", "splash-icon.png")
foreach ($asset in $requiredAssets) {
    $assetPath = Join-Path $assetsDir $asset
    if (-not (Test-Path $assetPath)) {
        Write-Host "Missing asset $asset, generating assets..." -ForegroundColor Yellow
        bun run (Join-Path $pocketDir "scripts/generate-assets.mjs")
        break
    }
}

foreach ($asset in $requiredAssets) {
    $assetPath = Join-Path $assetsDir $asset
    if (-not (Test-Path $assetPath)) {
        throw "Asset verification failed: missing $assetPath"
    }
    $item = Get-Item $assetPath
    if ($item.Length -le 0) {
        throw "Asset is empty: $assetPath"
    }
}
Write-Host "[OK] Required assets verified (CAN-0011 compliant icons present)." -ForegroundColor Green

# 3. Expo Prebuild & Gradle verification
if (-not $SkipPrebuild) {
    Write-Host "Running expo prebuild --platform android --clean..." -ForegroundColor Cyan
    npx expo prebuild --platform android --clean
}

$androidDir = Join-Path $pocketDir "android"
if (Test-Path $androidDir) {
    Set-Location $androidDir
    $gradlew = Join-Path $androidDir "gradlew.bat"
    if (Test-Path $gradlew) {
        Write-Host "Building Android APK ($BuildType)..." -ForegroundColor Cyan
        $gradleTask = if ($BuildType -eq "release") { "assembleRelease" } else { "assembleDebug" }
        & $gradlew $gradleTask
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed with exit code $LASTEXITCODE"
        }
        Write-Host "[OK] Android APK assembled successfully." -ForegroundColor Green
    } else {
        Write-Host "[WARN] gradlew.bat not found in $androidDir. Prebuild may need completion." -ForegroundColor Yellow
    }
    Set-Location $pocketDir
} else {
    Write-Host "[INFO] Android native folder will be generated during initial prebuild." -ForegroundColor Yellow
}

Write-Host "=== BUILD PREFLIGHT CHECK COMPLETE ===" -ForegroundColor Green

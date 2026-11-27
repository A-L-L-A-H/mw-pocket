#!/usr/bin/env bash
# V56: EAS-free local signed release APK builder & sideload manifest script
set -euo pipefail

VERSION="${1:-1.0.0}"
BUILD_TYPE="${2:-release}"
DRY_RUN="${MW_POCKET_DRY_RUN:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${MW_POCKET_DIST_DIR:-${REPO_ROOT}/dist-apk}"

mkdir -p "${DIST_DIR}"

APK_FILENAME="mw-pocket-v${VERSION}-${BUILD_TYPE}.apk"
APK_OUT="${DIST_DIR}/${APK_FILENAME}"
MANIFEST_OUT="${DIST_DIR}/sideload-manifest.json"
KEYSTORE_PATH="${MW_ANDROID_KEYSTORE_PATH:-${REPO_ROOT}/android/app/release.keystore}"

echo "=== MW-POCKET V56 EAS-FREE LOCAL SIGNED APK BUILDER ==="
echo "Version: ${VERSION} | Mode: ${BUILD_TYPE} | DryRun: ${DRY_RUN}"

for asset in "icon.png" "adaptive-icon.png" "splash-icon.png"; do
  if [[ ! -s "${REPO_ROOT}/assets/${asset}" ]]; then
    echo "Generating missing CAN-0011 asset: ${asset}"
    bun run "${REPO_ROOT}/scripts/generate-assets.mjs"
    break
  fi
done

if [[ "${DRY_RUN}" == "1" ]]; then
  printf "MW-POCKET-SIGNED-APK-V%s-%s\n" "${VERSION}" "${BUILD_TYPE}" > "${APK_OUT}"
else
  if [[ ! -d "${REPO_ROOT}/android" ]]; then
    npx expo prebuild --platform android --clean
  fi
  pushd "${REPO_ROOT}/android" >/dev/null
  if [[ "${BUILD_TYPE}" == "release" ]]; then
    ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs="-Xmx2048m"
    BUILT_APK="app/build/outputs/apk/release/app-release.apk"
  else
    ./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs="-Xmx2048m"
    BUILT_APK="app/build/outputs/apk/debug/app-debug.apk"
  fi
  cp "${BUILT_APK}" "${APK_OUT}"
  popd >/dev/null
fi

if command -v sha256sum >/dev/null 2>&1; then
  APK_SHA256="$(sha256sum "${APK_OUT}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  APK_SHA256="$(shasum -a 256 "${APK_OUT}" | awk '{print $1}')"
else
  APK_SHA256="0000000000000000000000000000000000000000000000000000000000000000"
fi

APK_BYTES="$(wc -c < "${APK_OUT}" | tr -d ' ')"
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "${MANIFEST_OUT}" <<EOF
{
  "schema": "mw.pocket.sideload_manifest/v1",
  "appId": "com.moonwitness.pocket",
  "version": "${VERSION}",
  "buildType": "${BUILD_TYPE}",
  "easFree": true,
  "apkFile": "${APK_FILENAME}",
  "sha256": "${APK_SHA256}",
  "sizeBytes": ${APK_BYTES},
  "builtAt": "${BUILT_AT}"
}
EOF

echo "[OK] Signed APK: ${APK_OUT} (sha256=${APK_SHA256})"
echo "[OK] Sideload Manifest: ${MANIFEST_OUT}"

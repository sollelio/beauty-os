#!/usr/bin/env bash
# Android R3 · the legacy launcher PNGs (Android 7.x, before adaptive icons), rendered from the official dark app icon
# (sollelio-brand-assets/beauty-os-v0.1/sollelio-beauty-os-app-icon-dark.svg), nothing redrawn. ic_launcher_round is the
# same composition in a circle (what Android 8+ shows under a circular mask). Needs rsvg-convert (librsvg).
set -euo pipefail
cd "$(dirname "$0")/.."
src=sollelio-brand-assets/beauty-os-v0.1/sollelio-beauty-os-app-icon-dark.svg
res=android/app/src/main/res
round=$(mktemp --suffix=.svg)
trap 'rm -f "$round"' EXIT
grep -q '<rect width="1024" height="1024" rx="224" fill="#11152D"/>' "$src"
sed 's|<rect width="1024" height="1024" rx="224" fill="#11152D"/>|<circle cx="512" cy="512" r="512" fill="#11152D"/>|' "$src" > "$round"
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  rsvg-convert -w "${d#*:}" -h "${d#*:}" "$src" -o "$res/mipmap-${d%%:*}/ic_launcher.png"
  rsvg-convert -w "${d#*:}" -h "${d#*:}" "$round" -o "$res/mipmap-${d%%:*}/ic_launcher_round.png"
done

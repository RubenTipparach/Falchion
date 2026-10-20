#!/usr/bin/env bash
# Render the hull graphs with Material Maker (headless: the material-maker-headless skill) and pack
# them into public/textures/ships/ (tools/materials/postprocess.py). Renders go to /tmp/mm-ships.
#   eval "$(bash .claude/skills/material-maker-headless/scripts/setup.sh | grep ^export)"
#   bash tools/materials/export_materials.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
RAW="${RAW:-/tmp/mm-ships}"
rm -rf "$RAW"
bash .claude/skills/material-maker-headless/scripts/render.sh -o "$RAW" --size 1024 tools/materials/ptex/*.ptex
python3 tools/materials/postprocess.py "$RAW"

#!/usr/bin/env bash
set -euo pipefail

VER="0.162.0"
ROOT="$(cd "$(dirname "$0")" && pwd)"
V="$ROOT/vendor"

echo "[*] Creating vendor tree…"
mkdir -p "$V/examples/jsm/controls" \
         "$V/examples/jsm/postprocessing" \
         "$V/examples/jsm/shaders"

cdn() {
  echo "https://cdn.jsdelivr.net/npm/three@${VER}/$1"
}

echo "[*] Downloading three@$VER modules…"
curl -fsSL "$(cdn build/three.module.js)" -o "$V/three.module.js"

echo "[*] Controls…"
curl -fsSL "$(cdn examples/jsm/controls/OrbitControls.js)" -o "$V/examples/jsm/controls/OrbitControls.js"

echo "[*] Postprocessing…"
curl -fsSL "$(cdn examples/jsm/postprocessing/EffectComposer.js)" -o "$V/examples/jsm/postprocessing/EffectComposer.js"
curl -fsSL "$(cdn examples/jsm/postprocessing/RenderPass.js)" -o "$V/examples/jsm/postprocessing/RenderPass.js"
curl -fsSL "$(cdn examples/jsm/postprocessing/UnrealBloomPass.js)" -o "$V/examples/jsm/postprocessing/UnrealBloomPass.js"
curl -fsSL "$(cdn examples/jsm/postprocessing/Pass.js)" -o "$V/examples/jsm/postprocessing/Pass.js"
curl -fsSL "$(cdn examples/jsm/postprocessing/ShaderPass.js)" -o "$V/examples/jsm/postprocessing/ShaderPass.js"
curl -fsSL "$(cdn examples/jsm/postprocessing/MaskPass.js)"  -o "$V/examples/jsm/postprocessing/MaskPass.js"
curl -fsSL "$(cdn examples/jsm/postprocessing/ClearPass.js)" -o "$V/examples/jsm/postprocessing/ClearPass.js"

echo "[*] Shader deps…"
curl -fsSL "$(cdn examples/jsm/shaders/CopyShader.js)" -o "$V/examples/jsm/shaders/CopyShader.js"
curl -fsSL "$(cdn examples/jsm/shaders/ConvolutionShader.js)" -o "$V/examples/jsm/shaders/ConvolutionShader.js"
curl -fsSL "$(cdn examples/jsm/shaders/LuminosityHighPassShader.js)" -o "$V/examples/jsm/shaders/LuminosityHighPassShader.js"

echo "[✓] Done. Start a local server and load index.html, e.g.:"
echo "    python3 -m http.server 8000"
echo "    open http://localhost:8000"

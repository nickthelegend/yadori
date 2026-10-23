#!/usr/bin/env bash
# Voice out for Yadori: Meta MMS-TTS (facebook/mms-tts-eng, VITS) as the ONNX port
# Xenova/mms-tts-eng, run on the gateway's CPU with transformers.js.
#
# LICENCE: the MMS-TTS weights are CC-BY-NC-4.0 (non-commercial). They are downloaded
# here, into models/ (gitignored), never committed. Run this only if you accept that licence.
set -euo pipefail
cd "$(dirname "$0")/.."
read -r -p "MMS-TTS weights are CC-BY-NC-4.0 (non-commercial). Download them? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || { echo "Not downloaded. The app keeps its labelled fallback voice."; exit 1; }
CI=true pnpm --filter @yadori/server add @huggingface/transformers@^3
dest=models/Xenova/mms-tts-eng
mkdir -p "$dest/onnx"
base=https://huggingface.co/Xenova/mms-tts-eng/resolve/main
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json onnx/model_quantized.onnx; do
  echo "fetching $f"
  curl -fL --retry 3 -o "$dest/$f" "$base/$f"
done
echo "Done. Restart the gateway (pnpm gateway); /api/status should show MMS-TTS ready."

# DEPLOY

This project loads a large ONNX model + WebAssembly runtime in the browser. Deployments
can fail if assets are blocked, cached incorrectly, or served from Git LFS pointers.

## Model + WASM Strategy (Required)

- Store the SAM model files in `public/models/` and load from same-origin.
- Store ONNX Runtime wasm files in `public/wasm/` and load from same-origin.
- Use long-cache headers for both paths.

Files required:
- `public/models/Xenova/slimsam-77-uniform/config.json`
- `public/models/Xenova/slimsam-77-uniform/preprocessor_config.json`
- `public/models/Xenova/slimsam-77-uniform/quantize_config.json`
- `public/models/Xenova/slimsam-77-uniform/onnx/vision_encoder_quantized.onnx`
- `public/models/Xenova/slimsam-77-uniform/onnx/prompt_encoder_mask_decoder_quantized.onnx`
- `public/wasm/ort-wasm.wasm`
- `public/wasm/ort-wasm-simd.wasm`
- `public/wasm/ort-wasm-threaded.wasm`
- `public/wasm/ort-wasm-simd-threaded.wasm`

## Common Pitfalls

### 1) Hugging Face download fails (SSL / Xet)
If you see:
`curl: (60) SSL: no alternative certificate subject name matches ... cas-bridge.xethub.hf.co`

Use the mirror endpoint:
```
HF_ENDPOINT=https://hf-mirror.com bash scripts/download_sam_model.sh
```

### 2) WASM compile error in production
If you see:
`expected magic word 00 61 73 6d, found 76 65 72 73`

This means the `.wasm` file is a Git LFS *pointer* (starts with `version ...`), not
the real binary. Vercel will serve that pointer if the file stays in LFS.

Fix:
- Exclude `public/models/**` and `public/wasm/**` from Git LFS.
- Re-add the files so git stores the real binaries.

### 3) Vercel domain shows old assets
If preview domains work but `project.vercel.app` fails, production may be pinned to
an older deployment or serving cached assets.

Checks:
- Vercel Dashboard → Deployments → Production commit SHA
- Vercel Dashboard → Settings → Git → Production Branch
- Confirm the production domain is attached to the correct project

If CDN cache is still serving old LFS pointers, consider versioning asset paths:
- `/models-v2/` and `/wasm-v2/` and update the worker paths.

## Verification Checklist

In DevTools Network, you must see:
- `/models/Xenova/slimsam-77-uniform/onnx/vision_encoder_quantized.onnx`
- `/models/Xenova/slimsam-77-uniform/onnx/prompt_encoder_mask_decoder_quantized.onnx`
- `/wasm/ort-wasm-simd-threaded.wasm` (or another wasm variant)

If requests still hit CDN or return text, the deployment is not using local binaries.

// onnxruntime-web (WebAssembly), set up once and shared by the OCR models.
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

let ortP = null;

export function getOrt() {
  if (!ortP) {
    ortP = import('onnxruntime-web/wasm').then((ort) => {
      ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      return ort;
    }).catch((e) => { ortP = null; throw e; });
  }
  return ortP;
}

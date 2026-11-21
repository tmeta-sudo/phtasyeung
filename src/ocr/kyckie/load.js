// Browser loader for the kyc-kie tagger (~1.9 MB, shipped with the app as a hashed asset,
// so the service worker keeps it after the first scan). Text never leaves the device.
import modelUrl from './model.onnx?url';
import meta from './model.onnx.json';
import { getOrt } from '../ort.js';
import { makeTagger, extract } from './extract.js';

let loading = null;

export function loadKycKie() {
  if (!loading) {
    loading = (async () => {
      const ort = await getOrt();
      const res = await fetch(modelUrl);
      if (!res.ok) throw new Error(`kyc-kie model download failed (${res.status})`);
      const session = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return makeTagger(ort, session, meta);
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export { extract };

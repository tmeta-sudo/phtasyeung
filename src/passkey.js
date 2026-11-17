// Passkey sign-in and registration in the browser (WebAuthn via @simplewebauthn/browser).
// The WebAuthn library is only downloaded when someone actually uses a passkey.
import { api } from './api.js';

const lib = () => import('@simplewebauthn/browser');
export const passkeysSupported = () => typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
export const autofillSupported = async () => {
  try { return passkeysSupported() && !!(await window.PublicKeyCredential.isConditionalMediationAvailable?.()); } catch { return false; }
};

/** Sign in with a passkey. `autofill` = offer saved passkeys in the e-mail field's suggestions. */
export async function signInWithPasskey({ autofill = false } = {}) {
  const { options, ticket } = await api('POST', '/api/auth/passkey/options', {});
  const { startAuthentication } = await lib();
  const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
  return api('POST', '/api/auth/passkey', { ticket, response });
}

export async function addPasskey(name) {
  const { options, ticket } = await api('POST', '/api/account/passkeys/options', {});
  const { startRegistration } = await lib();
  const response = await startRegistration({ optionsJSON: options });
  return api('POST', '/api/account/passkeys', { ticket, response, name });
}

/** A short Khmer message for the errors people actually hit (cancelled, already added, not supported). */
export function passkeyError(e) {
  const n = e?.name || e?.cause?.name;
  if (n === 'NotAllowedError' || n === 'AbortError') return '';
  if (n === 'InvalidStateError' || /already registered/i.test(e?.message)) return 'ឧបករណ៍នេះមាន Passkey សម្រាប់គណនីនេះរួចហើយ';
  if (n === 'NotSupportedError' || n === 'SecurityError') return 'កម្មវិធីរុករកនេះមិនគាំទ្រ Passkey ទេ — សាក Chrome ឬ Safari';
  return e?.message || 'មានបញ្ហា';
}

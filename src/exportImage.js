// Turn a DOM node (invoice, contract) into a PNG — for downloading, sharing or sending to Telegram.

export async function nodeToPng(node, { pixelRatio = 2, background = '#ffffff' } = {}) {
  const [{ toBlob }] = await Promise.all([import('html-to-image'), document.fonts?.ready]);
  return toBlob(node, {
    pixelRatio, cacheBust: true, backgroundColor: background,
    filter: (n) => !(n instanceof HTMLElement && n.dataset.noexport !== undefined),
  });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Native share sheet (Telegram, Messenger, …) on phones; falls back to download. */
export async function shareBlob(blob, name, title) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}

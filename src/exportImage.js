// Turn a DOM node (invoice, contract) into a PNG — for downloading, sharing or sending to Telegram.

/**
 * The same picture on every phone: the document is laid out at a fixed page width first
 * (a narrow phone screen used to cut the right side off), then captured at its full height.
 */
export async function nodeToPng(node, { pixelRatio = 2, background = '#ffffff', width = 760 } = {}) {
  const [{ toBlob }] = await Promise.all([import('html-to-image'), document.fonts?.ready]);
  const saved = node.getAttribute('style') || '';
  const W = Math.max(width, Math.ceil(node.scrollWidth));
  node.style.width = `${W}px`;
  node.style.maxWidth = 'none';
  node.style.minWidth = `${W}px`;
  node.classList.add('exporting');
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const H = Math.ceil(node.scrollHeight);
    return await toBlob(node, {
      pixelRatio, cacheBust: true, backgroundColor: background, width: W, height: H,
      style: { width: `${W}px`, maxWidth: 'none', margin: '0', transform: 'none' },
      filter: (n) => !(n instanceof HTMLElement && n.dataset.noexport !== undefined),
    });
  } finally {
    node.setAttribute('style', saved);
    if (!saved) node.removeAttribute('style');
    node.classList.remove('exporting');
  }
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

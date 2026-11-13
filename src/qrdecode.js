// Read a QR code from an image file (photo or screenshot of a bank app).
import jsQR from 'jsqr';

export async function decodeQrFromFile(file) {
  const bmp = await createImageBitmap(file);
  if ('BarcodeDetector' in window) {
    try {
      const codes = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bmp);
      if (codes[0]?.rawValue) return codes[0].rawValue;
    } catch { /* fall back to jsQR */ }
  }
  // Try a few scales: screenshots are large, photos can be blurry.
  for (const max of [1400, 900, 2000, 600]) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (code?.data) return code.data;
  }
  return '';
}

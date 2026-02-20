/**
 * Burn a visible watermark into an image file (canvas-based).
 * Shows user name and timestamp.
 * Returns a new data URL with the watermark permanently embedded.
 */
export async function burnVisibleWatermark(
  imageDataUrl: string,
  creatorId: string,
  timestamp: string,
  displayName?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      const name = displayName || creatorId;
      const date = new Date(timestamp).toLocaleString();
      const text = `© ${name} • ${date}`;

      // Diagonal repeating watermark
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#000000';
      const fontSize = Math.max(14, Math.round(img.width / 30));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.translate(img.width / 2, img.height / 2);
      ctx.rotate(-Math.PI / 6);

      const textWidth = ctx.measureText(text).width;
      const gap = textWidth + 60;
      const rows = Math.ceil((img.width + img.height) / (fontSize * 3));
      const cols = Math.ceil((img.width + img.height) / gap);

      for (let r = -rows; r <= rows; r++) {
        for (let c = -cols; c <= cols; c++) {
          ctx.fillText(text, c * gap, r * fontSize * 3);
        }
      }
      ctx.restore();

      // Corner badge showing username (not "Protected")
      ctx.save();
      const badgeText = `© ${name}`;
      const badgeFontSize = Math.max(10, Math.round(img.width / 50));
      ctx.font = `bold ${badgeFontSize}px sans-serif`;
      const bw = ctx.measureText(badgeText).width + 16;
      const bh = badgeFontSize + 10;
      const bx = img.width - bw - 8;
      const by = img.height - bh - 8;

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, bh / 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, bx + 8, by + badgeFontSize + 2);
      ctx.restore();

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => reject(new Error('Failed to load image for visible watermark'));
    img.src = imageDataUrl;
  });
}

import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';

export function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      const cell = Math.max(2, Math.floor(size / count));
      const dim = cell * count;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}">`;
      svg += `<rect width="${dim}" height="${dim}" fill="#ffffff"/>`;
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            svg += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#000000"/>`;
          }
        }
      }
      svg += '</svg>';
      setUrl('data:image/svg+xml;base64,' + btoa(svg));
    } catch {
      setUrl('');
    }
  }, [value, size]);

  if (!url) return <div className="bg-white rounded-xl" style={{ width: size, height: size }} />;
  return <img src={url} width={size} height={size} alt="QR" className="rounded-xl" />;
}

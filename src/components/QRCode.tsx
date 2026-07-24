import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';

export function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      const cell = Math.max(2, Math.floor(size / count));
      const dim = cell * count;
      let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}">`;
      s += `<rect width="${dim}" height="${dim}" fill="#ffffff"/>`;
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            s += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#000000"/>`;
          }
        }
      }
      s += '</svg>';
      setSvg(s);
    } catch {
      setSvg('');
    }
  }, [value, size]);

  if (!svg) return <div className="bg-white rounded-md" style={{ width: size, height: size }} />;
  return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={size} height={size} alt="QR" className="rounded-md" />;
}

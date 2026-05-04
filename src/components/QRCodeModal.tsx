import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { X, Download, Printer } from 'lucide-react';

interface QRCodeModalProps {
  branch: { id: string, name: string };
  product: { id: string, name: string };
  onClose: () => void;
}

export default function QRCodeModal({ branch, product, onClose }: QRCodeModalProps) {
  const [amount, setAmount] = useState('1');
  const [type, setType] = useState<'add' | 'remove'>('add');

  const qrValue = `${branch.id}:${product.id}:${amount}:${type}`;

  const downloadQR = () => {
    const svg = document.getElementById('qr-to-print');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR_${branch.id}_${product.id}_${type}_${amount}.png`;
      downloadLink.href = `${pngFile}`;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-earth/60 p-4 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="bg-white p-8 rounded-[32px] w-full max-w-md border border-sage/10 shadow-2xl"
      >
        <div className="flex justify-between items-start mb-8">
          <div>
            <h3 className="text-2xl font-serif font-medium text-earth">Action QR Code</h3>
            <p className="text-xs font-mono text-sage/60 uppercase">Printable Stock Label</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bone rounded-full">
            <X className="w-6 h-6 text-earth" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col items-center bg-bone p-8 rounded-2xl border border-sage/5">
            <QRCodeSVG 
              id="qr-to-print"
              value={qrValue} 
              size={200}
              level="H"
              includeMargin={true}
            />
            <div className="mt-4 text-center">
              <p className="text-sm font-mono font-bold text-earth">{qrValue}</p>
              <p className="text-[10px] font-mono text-sage/40 uppercase mt-1">
                {branch.name} • {product.name}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono uppercase text-sage/60 mb-1">Pre-set Qty</label>
              <input 
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 bg-bone border border-sage/10 rounded-xl focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-sage/60 mb-1">Action Type</label>
              <select 
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-4 py-3 bg-bone border border-sage/10 rounded-xl focus:outline-none appearance-none"
              >
                <option value="add">Addition (+)</option>
                <option value="remove">Removal (-)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={downloadQR}
              className="flex-1 py-4 bg-earth text-white rounded-2xl flex items-center justify-center gap-2 hover:bg-earth/90 transition-all font-medium"
            >
              <Download className="w-5 h-5" />
              Download PNG
            </button>
            <button 
              onClick={() => window.print()}
              className="px-6 py-4 border border-sage/20 text-sage rounded-2xl hover:bg-bone transition-all"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
          
          <p className="text-[10px] text-center text-sage/40 font-mono italic">
            Scanning this code will instantly execute the specified action.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

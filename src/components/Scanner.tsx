import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { motion } from 'motion/react';
import { QrCode, X } from 'lucide-react';

interface ScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export default function Scanner({ onScan, onClose }: ScannerProps) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        onScan(decodedText);
        scanner.clear();
      },
      (error) => {
        // Handle scan error or just ignore
      }
    );

    return () => {
      scanner.clear().catch(err => console.error("Failed to clear scanner", err));
    };
  }, [onScan]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-earth/60 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white p-8 shadow-2xl border border-sage/10">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-bone rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-earth" />
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-bone rounded-2xl">
            <QrCode className="w-8 h-8 text-sage" />
          </div>
          <div>
            <h2 className="text-2xl font-serif font-medium text-earth">Scan QR Label</h2>
            <p className="text-xs font-mono uppercase text-sage/40">Secure Entry Point</p>
          </div>
        </div>

        <div id="reader" className="w-full bg-bone rounded-2xl overflow-hidden border border-sage/10 shadow-inner"></div>
        
        <p className="mt-6 text-sm text-sage font-mono italic text-center">
          Align the code within the frame for rapid capture
        </p>
      </div>
    </motion.div>
  );
}

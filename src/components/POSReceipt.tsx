import React from 'react';
import { createPortal } from 'react-dom';

interface POSReceiptProps {
  sale: any;
  branch: any;
  cashier: string;
  products: any[];
}

export default function POSReceipt({ sale, branch, cashier, products }: POSReceiptProps) {
  if (!sale) return null;

  const content = (
    <div id="printable-receipt-portal" className="fixed top-0 left-0 opacity-0 pointer-events-none print:opacity-100 print:pointer-events-auto w-[80mm] bg-white font-mono text-[11px] text-black leading-tight p-4">
      <div className="text-center mb-4">
        <h1 className="text-lg font-bold uppercase tracking-widest mb-1">{branch?.name || 'MineAzy'}</h1>
        <p className="text-[9px] uppercase font-bold text-gray-400 mb-2">Inventory Management System</p>
        <div className="w-full border-t border-black border-dashed my-1" />
        <p className="text-[10px]">{branch?.location || ''}</p>
        <p className="text-[10px]">TEL: +263 775 000 000</p>
      </div>

      <div className="mb-3 space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span>DATE:</span>
          <span>{new Date(sale.timestamp).toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between">
          <span>TIME:</span>
          <span>{new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex justify-between">
          <span>CASHIER:</span>
          <span className="uppercase text-[9px]">{cashier}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>RECEIPT:</span>
          <span>#{String(sale.id).slice(-8).toUpperCase()}</span>
        </div>
      </div>

      <div className="w-full border-t border-black border-dashed my-2" />

      <table className="w-full mb-3">
        <thead>
          <tr className="text-left font-bold text-[9px] border-b border-black border-dotted">
            <th className="py-1">ITEM</th>
            <th className="py-1 text-center">QTY</th>
            <th className="py-1 text-right">PRICE</th>
            <th className="py-1 text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody className="text-[10px]">
          {sale.items.map((item: any, idx: number) => {
            const product = products.find((p: any) => p.id === item.productId);
            return (
              <tr key={idx} className="border-b border-black border-dotted last:border-0 border-opacity-10">
                <td className="py-1.5 pr-1 max-w-[35mm] overflow-hidden">
                  <p className="font-bold uppercase truncate">{product?.name || 'Item'}</p>
                </td>
                <td className="py-1.5 text-center align-middle">{item.quantity}</td>
                <td className="py-1.5 text-right align-middle">{item.price.toFixed(2)}</td>
                <td className="py-1.5 text-right align-middle font-bold">{(item.quantity * item.price).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="w-full border-t border-black border-dashed my-2" />

      <div className="space-y-1 mb-4 text-[10px]">
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL USD:</span>
          <span>${sale.total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[9px] opacity-60 italic">
          <span>Rate (Est):</span>
          <span>Zwrt 25000.00</span>
        </div>
      </div>

      {sale.customer_name && (
        <div className="mb-3 text-[9px] border border-black border-dotted p-2 rounded-lg">
          <p className="font-bold opacity-40">CUSTOMER:</p>
          <p className="uppercase font-black">{sale.customer_name}</p>
        </div>
      )}

      <div className="text-center mt-6">
        <div className="w-full border-t border-black border-dashed my-3" />
        <p className="text-[9px] font-bold uppercase tracking-widest mb-1 text-gray-600">Verified System Audit</p>
        <p className="text-[8px] opacity-70">Goods sold are non-refundable.</p>
        <p className="text-[8px] mt-1 italic tracking-widest">OFFICIAL RECEIPT</p>
        
        <div className="mt-4 flex flex-col items-center gap-1">
           <div className="h-5 w-40 flex items-center justify-center gap-[1px]">
             {[...Array(40)].map((_, i) => (
               <div key={i} className={`h-4 bg-black ${i % 4 === 0 ? 'w-[2px]' : i % 7 === 0 ? 'w-[1px] opacity-40' : 'w-[1px]'}`} />
             ))}
           </div>
           <p className="text-[7px] font-mono tracking-[0.4em] opacity-40">*{String(sale.id).slice(-8)}*</p>
        </div>
      </div>
      
      <div className="h-16" />
    </div>
  );

  return createPortal(content, document.body);
}

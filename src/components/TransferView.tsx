import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRightLeft, Package, Trash2, Send, AlertTriangle, Store, Plus, CircleGauge } from 'lucide-react';

interface TransferViewProps {
  branches: any[];
  products: any[];
  inventory: any[];
  transferStock: (from: string, to: string, items: any[], notes: string) => Promise<void>;
  profile: any;
}

export default function TransferView({ branches, products, inventory, transferStock, profile }: TransferViewProps) {
  const isLimited = profile?.role === 'Supervisor' || profile?.role === 'Cashier';
  const [fromBranch, setFromBranch] = useState(profile?.branch_id || branches[0]?.id || '');
  const [toBranch, setToBranch] = useState(branches.find(b => b.id !== (profile?.branch_id || branches[0]?.id))?.id || '');
  const [items, setItems] = useState<{ productId: string, quantity: number }[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fromBranchInventory = inventory.filter(i => i.branch_id === fromBranch);

  const addItem = () => {
    if (products.length > 0) {
      setItems([...items, { productId: products[0].id, quantity: 1 }]);
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    setItems(items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromBranch || !toBranch || fromBranch === toBranch || items.length === 0) return;
    
    // Validate stock
    for (const item of items) {
      const stock = fromBranchInventory.find(i => i.product_id === item.productId)?.stock || 0;
      if (item.quantity > stock) {
        alert(`Insufficient stock for ${products.find(p => p.id === item.productId)?.name}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await transferStock(fromBranch, toBranch, items, notes);
      setItems([]);
      setNotes('');
      alert("Transfer completed successfully!");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-12">
      <div className="bg-white rounded-[3rem] border border-ink/5 shadow-2xl shadow-ink/[0.02] overflow-hidden">
        <div className="p-12 border-b border-ink/5 bg-background/50">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-ink rounded-[1.5rem] text-primary shadow-xl shadow-ink/20 rotate-3">
              <ArrowRightLeft className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-serif text-4xl text-ink leading-none italic font-medium">Initiate Stock Transfer</h3>
              <p className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.3em] mt-3">Node-to-Node Logistics Protocol</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-12 space-y-12">
          {/* Branch Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative">
            <div className="space-y-4">
              <label className="text-[10px] font-mono font-black uppercase text-ink/30 tracking-[0.2em] ml-2 flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" />
                Source Node
              </label>
              <select 
                value={fromBranch}
                disabled={isLimited}
                onChange={(e) => setFromBranch(e.target.value)}
                className="w-full bg-background border border-ink/5 rounded-[1.5rem] px-6 py-5 focus:ring-4 focus:ring-primary/5 outline-none font-bold text-xs uppercase tracking-widest text-ink appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="absolute left-1/2 top-[60%] -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-white border border-ink/5 shadow-xl rounded-full hidden md:flex items-center justify-center z-10 text-primary">
              <ArrowRightLeft className="w-6 h-6" />
            </div>

            <div className="space-y-4 md:pl-6">
              <label className="text-[10px] font-mono font-black uppercase text-ink/30 tracking-[0.2em] ml-2 flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" />
                Destination Node
              </label>
              <select 
                value={toBranch}
                onChange={(e) => setToBranch(e.target.value)}
                className="w-full bg-background border border-ink/5 rounded-[1.5rem] px-6 py-5 focus:ring-4 focus:ring-primary/5 outline-none font-bold text-xs uppercase tracking-widest text-ink appearance-none cursor-pointer"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          {fromBranch === toBranch && (
            <div className="p-6 bg-secondary/5 border border-secondary/10 rounded-2xl flex items-center gap-4 text-secondary text-[10px] font-mono font-black uppercase tracking-widest">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              Error: Source and destination protocols must be distinct.
            </div>
          )}

          {/* Items Table */}
          <div className="space-y-6">
            <div className="flex justify-between items-center px-4">
              <h4 className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-ink/40">Transport Manifest</h4>
              <button 
                type="button"
                onClick={addItem}
                className="bg-primary text-white p-2 rounded-lg shadow-lg shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-background border border-ink/5 rounded-[2.5rem] overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-mono font-black uppercase tracking-[0.2em] text-ink/20 border-b border-ink/5">
                    <th className="px-8 py-6">Resource Artifact</th>
                    <th className="px-8 py-6 text-center">Magnitude</th>
                    <th className="px-8 py-6 text-center">Avail. Stock</th>
                    <th className="px-8 py-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/[0.03]">
                  {items.map((item, index) => {
                    const product = products.find(p => p.id === item.productId);
                    const stock = fromBranchInventory.find(i => i.product_id === item.productId)?.stock || 0;
                    return (
                      <tr key={index} className="group hover:bg-white/40 transition-colors">
                        <td className="px-8 py-6">
                          <select 
                            value={item.productId}
                            onChange={(e) => updateItem(index, 'productId', e.target.value)}
                            className="bg-transparent font-serif text-lg italic text-ink outline-none cursor-pointer group-hover:text-primary transition-colors"
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <input 
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                            className="w-24 bg-white border border-ink/5 rounded-xl px-4 py-2 font-mono font-black text-sm text-ink focus:ring-4 focus:ring-primary/5 outline-none text-center"
                          />
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className={`font-mono text-xs font-black tracking-tighter ${item.quantity > stock ? 'text-danger' : 'text-ink/40'}`}>
                            {stock} <span className="text-[9px] uppercase tracking-widest opacity-40 ml-1">{product?.unit}</span>
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            type="button" 
                            onClick={() => removeItem(index)}
                            className="text-ink/10 hover:text-danger transition-all hover:scale-110 active:scale-90"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-10">
                          <Package className="w-12 h-12" />
                          <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]">Manifest void. Awaiting allocation.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-mono font-black uppercase text-ink/30 tracking-[0.2em] ml-2">Audit Annotations</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal record notes or movement justification..."
              className="w-full bg-background border border-ink/5 rounded-[2rem] px-8 py-6 min-h-[120px] outline-none focus:ring-4 focus:ring-primary/5 transition-all text-ink font-medium"
            />
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || items.length === 0 || fromBranch === toBranch}
            className="w-full py-6 bg-ink text-white rounded-[2.5rem] font-bold text-[10px] uppercase tracking-[0.4em] shadow-2xl shadow-ink/20 flex items-center justify-center gap-4 transition-all hover:translate-y-[-4px] active:scale-95 disabled:opacity-30"
          >
            {isSubmitting ? (
              <CircleGauge className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <Send className="w-5 h-5 text-primary" />
            )}
            {isSubmitting ? 'EXECUTING LOGISTICS...' : 'FINALIZE & EXECUTE MOVEMENT'}
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardList, 
  Plus, 
  Send, 
  X, 
  Clock, 
  CheckCircle2, 
  Ban,
  Trash2,
  PackageCheck,
  Package
} from 'lucide-react';

interface OrdersViewProps {
  orders: any[];
  branches: any[];
  products: any[];
  createOrder: (branchId: string, items: any[], notes: string) => void;
  dispatchOrder: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;
  acknowledgeOrder: (orderId: string) => void;
  profile: any;
}

export default function OrdersView({ orders, branches, products, createOrder, dispatchOrder, cancelOrder, acknowledgeOrder, profile }: OrdersViewProps) {
  const isLimited = profile?.role === 'Supervisor' || profile?.role === 'Cashier';
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(profile?.branch_id || '');
  const [orderItems, setOrderItems] = useState<{ productId: string, quantity: number }[]>([]);
  const [notes, setNotes] = useState('');

  const handleAddItem = () => {
    setOrderItems([...orderItems, { productId: products[0]?.id || '', quantity: 1 }]);
  };

  const handleRemoveItem = (idx: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: 'productId' | 'quantity', value: any) => {
    const newItems = [...orderItems];
    (newItems[idx] as any)[field] = field === 'quantity' ? parseFloat(value) : value;
    setOrderItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch || orderItems.length === 0) return;
    createOrder(selectedBranch, orderItems, notes);
    setShowCreateModal(false);
    setSelectedBranch('');
    setOrderItems([]);
    setNotes('');
  };

  const sortedOrders = [...orders].sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-10">
        <h3 className="text-4xl font-serif italic text-ink">Dispatch Pipeline</h3>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="px-8 py-4 bg-ink text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 shadow-xl hover:translate-y-[-2px] transition-all"
        >
          <Plus className="w-4 h-4" />
          Initiate Order
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-12">
        {sortedOrders.map((order) => {
          const branch = branches.find(b => b.id === order.branch_id);
          return (
            <motion.div 
              key={order.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01] flex flex-col group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-mono font-black uppercase tracking-[0.2em] ${
                    order.status === 'pending' ? 'bg-warning/10 text-warning' :
                    order.status === 'dispatched' ? 'bg-secondary/10 text-secondary' :
                    order.status === 'received' ? 'bg-accent/10 text-accent' :
                    'bg-ink/10 text-ink/40'
                  }`}>
                    {order.status}
                  </span>
                  <p className="text-[10px] font-mono text-ink/30 mt-3 font-bold uppercase">
                    {order.created_at ? new Date(order.created_at).toLocaleString() : 'PENDING'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-background rounded-2xl flex items-center justify-center text-ink/20 group-hover:text-primary transition-colors">
                  <ClipboardList className="w-6 h-6" />
                </div>
              </div>

              <h4 className="font-serif text-2xl font-medium text-ink mb-6 italic">{branch?.name || 'Unknown Node'}</h4>

              <div className="flex-1 space-y-3 mb-8">
                {order.items?.map((item: any, i: number) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-ink/[0.03] last:border-0">
                      <span className="text-ink/60 text-xs font-medium">{product?.name || item.productId}</span>
                      <div className="flex items-center gap-2">
                         <span className="font-mono font-black text-ink text-sm">{item.quantity}</span>
                         <span className="text-[9px] font-mono text-ink/30 uppercase">{product?.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {order.notes && (
                <div className="mb-8 p-4 bg-background rounded-2xl border border-ink/5 italic text-xs text-ink/40 font-serif">
                   "{order.notes}"
                </div>
              )}

              {order.status === 'pending' && (
                <div className="flex gap-4 mt-auto">
                  <button 
                    onClick={() => dispatchOrder(order.id)}
                    className="flex-1 py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:translate-y-[-2px] transition-all shadow-lg shadow-primary/20"
                  >
                    <PackageCheck className="w-4 h-4" />
                    Dispatch
                  </button>
                  <button 
                    onClick={() => cancelOrder(order.id)}
                    className="p-4 bg-danger/10 text-danger rounded-2xl hover:bg-danger hover:text-white transition-all active:scale-90"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                </div>
              )}

              {order.status === 'dispatched' && (
                <div className="flex gap-4 mt-auto">
                  <button 
                    onClick={() => acknowledgeOrder(order.id)}
                    className="flex-1 py-4 bg-ink text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm Receipt
                  </button>
                </div>
              )}

              {order.status === 'received' && (
                <div className="mt-auto pt-6 border-t border-ink/5 flex flex-col items-center gap-2">
                   <div className="flex items-center justify-center gap-2 text-accent font-mono text-[9px] font-black uppercase tracking-[0.2em]">
                    <CheckCircle2 className="w-4 h-4" />
                    Archive Complete
                  </div>
                  <p className="text-[9px] font-mono text-ink/30 uppercase font-bold">
                    T-PLUS: {order.received_at ? new Date(order.received_at).toLocaleString() : ''}
                  </p>
                </div>
              )}
            </motion.div>
          );
        })}

        {sortedOrders.length === 0 && (
          <div className="col-span-full py-32 flex flex-col items-center justify-center gap-6">
            <div className="w-20 h-20 bg-ink/5 rounded-full flex items-center justify-center text-ink/10">
              <ClipboardList className="w-10 h-10" />
            </div>
            <p className="font-serif italic text-xl text-ink/30">The dispatch pipeline is currently empty.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-md"
          >
            <motion.form 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              onSubmit={handleSubmit}
              className="bg-white p-10 rounded-[3rem] w-full max-w-lg border border-white/10 shadow-2xl space-y-10"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-4xl font-serif font-medium text-ink italic">Order Blueprint</h3>
                  <p className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest mt-1">Resource Requisition</p>
                </div>
                <button type="button" onClick={() => setShowCreateModal(false)} className="p-3 bg-background hover:bg-ink hover:text-white rounded-full transition-all active:scale-90">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1 tracking-widest">Network Node</label>
                  <select 
                    required
                    value={selectedBranch}
                    disabled={isLimited}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full px-6 py-4 bg-background border border-ink/5 rounded-2xl font-bold text-ink uppercase tracking-widest text-xs focus:ring-4 focus:ring-primary/5 transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Endpoint...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Resource Allocation</label>
                    <button 
                      type="button" 
                      onClick={handleAddItem}
                      className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Item
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {orderItems.map((item, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={idx} 
                        className="flex gap-3 items-center p-3 bg-background rounded-2xl border border-ink/5 group"
                      >
                        <select 
                          required
                          value={item.productId}
                          onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                          className="flex-1 px-4 py-2 bg-white border border-ink/5 rounded-xl text-xs font-bold text-ink"
                        >
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <input 
                          type="number"
                          required
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-24 px-4 py-2 bg-white border border-ink/5 rounded-xl text-xs font-mono font-bold"
                        />
                        <button 
                          type="button" 
                          onClick={() => handleRemoveItem(idx)}
                          className="p-2 text-ink/20 hover:text-danger transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </motion.div>
                    ))}
                    {orderItems.length === 0 && (
                      <div className="py-12 flex flex-col items-center justify-center gap-4 bg-background border-2 border-dashed border-ink/5 rounded-[2rem]">
                        <Package className="w-8 h-8 text-ink/10" />
                        <p className="text-[10px] font-mono text-ink/20 uppercase font-black tracking-widest">No resources assigned</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1 tracking-widest">Internal Narrative</label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-6 py-5 bg-background border border-ink/5 rounded-2xl focus:ring-4 focus:ring-primary/5 transition-all resize-none h-24 text-xs font-medium"
                    placeholder="Authorization notes or specific handling instructions..."
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-5 font-bold text-[10px] text-ink uppercase tracking-[0.2em] hover:bg-background rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={orderItems.length === 0}
                  className="flex-1 py-5 font-bold bg-primary text-white rounded-2xl uppercase tracking-[0.3em] shadow-xl shadow-primary/20 hover:translate-y-[-2px] transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-3 text-[10px]"
                >
                  <Send className="w-4 h-4" />
                  Transmit Order
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

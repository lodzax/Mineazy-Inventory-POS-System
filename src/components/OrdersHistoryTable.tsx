import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, ArrowUpDown, PackageCheck, Truck, X, Plus, Trash2, Send, Printer } from 'lucide-react';

interface OrdersHistoryTableProps {
  orders: any[];
  branches: any[];
  products: any[];
  initiateOrder: (branchId: string, items: any[], notes: string) => Promise<void>;
  fulfillOrder: (orderId: string | number, items: any[], notes: string) => void;
  dispatchOrder: (orderId: string | number) => void;
  cancelOrder: (orderId: string | number) => void;
  confirmReceipt: (orderId: string | number) => void;
  profile: any;
}

export default function OrdersHistoryTable({ 
  orders, 
  branches, 
  products, 
  initiateOrder,
  fulfillOrder, 
  dispatchOrder, 
  cancelOrder, 
  confirmReceipt, 
  profile 
}: OrdersHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fulfillingOrder, setFulfillingOrder] = useState<any | null>(null);
  const [fulfillmentItems, setFulfillmentItems] = useState<any[]>([]);
  const [fNotes, setFNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [newOrderBranch, setNewOrderBranch] = useState(profile?.branch_id || '');
  const [newOrderItems, setNewOrderItems] = useState<{ productId: string, quantity: number }[]>([]);
  const [newOrderNotes, setNewOrderNotes] = useState('');

  const isWarehouse = profile?.role?.toLowerCase() === 'warehouse' || 
                      profile?.role?.toLowerCase() === 'administrator' || 
                      profile?.role?.toLowerCase() === 'manager';

  const isAdmin = profile?.role?.toLowerCase() === 'administrator' || 
                  profile?.role?.toLowerCase() === 'manager';

  const filteredOrders = orders.filter(order => {
    const branch = branches.find(b => b.id === order.branch_id);
    const matchesSearch = branch?.name.toLowerCase().includes(search.toLowerCase()) || 
                          order.id.toString().toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));

  const openFulfillment = (order: any) => {
    setFulfillingOrder(order);
    setFulfillmentItems(order.items.map((item: any) => ({
      ...item,
      suppliedQuantity: item.suppliedQuantity ?? item.quantity
    })));
    setFNotes(order.notes || '');
  };

  const handleFulfillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fulfillingOrder) return;
    setIsSubmitting(true);
    try {
      await fulfillOrder(fulfillingOrder.id, fulfillmentItems, fNotes);
      setFulfillingOrder(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateItemSupply = (idx: number, val: string) => {
    const newItems = [...fulfillmentItems];
    newItems[idx].suppliedQuantity = val === '' ? 0 : parseFloat(val);
    setFulfillmentItems(newItems);
  };

  const handleInitiateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderBranch || newOrderItems.length === 0) return;
    setIsSubmitting(true);
    try {
      await initiateOrder(newOrderBranch, newOrderItems, newOrderNotes);
      setShowInitiateModal(false);
      setNewOrderItems([]);
      setNewOrderNotes('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addNewOrderItem = () => {
    setNewOrderItems([...newOrderItems, { productId: products[0]?.id || '', quantity: 1 }]);
  };

  const removeNewOrderItem = (idx: number) => {
    setNewOrderItems(newOrderItems.filter((_, i) => i !== idx));
  };

  const updateNewOrderItem = (idx: number, field: string, val: any) => {
    const items = [...newOrderItems];
    (items[idx] as any)[field] = field === 'quantity' ? (val === '' ? 0 : parseFloat(val)) : val;
    setNewOrderItems(items);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="relative w-full md:w-[450px]">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
          <input 
            type="text"
            placeholder="Search order stream..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-14 pr-6 py-5 bg-white border border-ink/5 rounded-[2rem] shadow-xl shadow-ink/[0.01] focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all font-medium text-xs"
          />
        </div>

        <div className="flex items-center gap-4 bg-white p-2 border border-ink/5 rounded-[1.5rem] shadow-xl shadow-ink/[0.01]">
          <Filter className="w-4 h-4 text-primary ml-3" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-6 py-3 bg-background border-none rounded-xl font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ink focus:outline-none appearance-none cursor-pointer pr-12 min-w-[200px]"
          >
            <option value="all">ALL PROTOCOLS</option>
            <option value="Pending">PENDING</option>
            <option value="Processed">PROCESSED</option>
            <option value="Dispatched">DISPATCHED</option>
            <option value="Received">RECEIVED</option>
            <option value="Cancelled">CANCELLED</option>
          </select>
        </div>

        <button 
          onClick={() => { window.focus(); window.print(); }}
          className="px-8 py-5 bg-ink text-white border border-ink/5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95 no-print"
        >
          <Printer className="w-4 h-4 text-primary" />
          <span>Print Audit</span>
        </button>

        {!isWarehouse && (
          <button 
            onClick={() => setShowInitiateModal(true)}
            className="px-8 py-5 bg-ink text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Initiate Requisition</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-2xl shadow-ink/[0.02]">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background font-mono text-[9px] font-black uppercase tracking-[0.2em] text-ink/40">
                <th className="px-10 py-6">Audit Timestamp</th>
                <th className="px-10 py-6 text-primary tracking-tighter">Order Vector</th>
                <th className="px-10 py-6">Branch Node</th>
                <th className="px-10 py-6">Manifest Content</th>
                <th className="px-10 py-6">Protocol Status</th>
                <th className="px-10 py-6 text-right">Sequence Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.03]">
              {sortedOrders.map((order) => {
                const branch = branches.find(b => b.id === order.branch_id);
                return (
                  <tr key={order.id} className="text-xs hover:bg-background transition-all group">
                    <td className="px-10 py-6 font-mono text-[10px] font-bold text-ink/40 group-hover:text-ink">
                      {order.created_at ? new Date(order.created_at).toLocaleString() : 'PENDING'}
                    </td>
                    <td className="px-10 py-6 font-mono text-[10px] font-black text-ink uppercase tracking-tight">
                      #{order.id.toString().slice(0, 8)}
                    </td>
                    <td className="px-10 py-6">
                      <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-black uppercase tracking-widest text-ink/60">{branch?.name || '---'}</span>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex flex-wrap gap-2">
                        {order.items?.map((item: any, i: number) => {
                          const product = products.find(p => p.id === item.productId);
                          const hasSupply = item.suppliedQuantity !== undefined;
                          return (
                            <span key={i} className="text-[9px] font-mono font-black border border-ink/5 px-2 py-1 rounded-lg text-ink/40 group-hover:border-primary/20 group-hover:text-primary transition-all flex items-center gap-1">
                               <span>{item.quantity}{hasSupply ? ` → ${item.suppliedQuantity}` : ''}</span>
                               <span className="opacity-40 font-normal">×</span>
                               <span>{product?.name || item.productId}</span>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-mono font-black uppercase tracking-widest shadow-sm ${
                        order.status === 'Pending' ? 'bg-warning/10 text-warning' :
                        order.status === 'Processed' ? 'bg-primary/10 text-primary' :
                        order.status === 'Dispatched' ? 'bg-secondary/10 text-secondary' :
                        order.status === 'Received' ? 'bg-accent/10 text-accent' :
                        'bg-danger/10 text-danger'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right space-y-1">
                      <div className="flex items-center justify-end gap-2">
                        {isWarehouse && order.status === 'Pending' && (
                          <button 
                            onClick={() => openFulfillment(order)}
                            className="p-3 bg-primary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
                            title="Fulfill Order"
                          >
                            <PackageCheck className="w-4 h-4" />
                          </button>
                        )}
                        {isWarehouse && order.status === 'Processed' && (
                          <button 
                            onClick={() => dispatchOrder(order.id)}
                            className="p-3 bg-secondary text-white rounded-xl hover:shadow-lg hover:shadow-secondary/30 transition-all active:scale-95"
                            title="Dispatch Order"
                          >
                            <Truck className="w-4 h-4" />
                          </button>
                        )}
                        {!isWarehouse && order.status === 'Dispatched' && (
                          <button 
                            onClick={() => confirmReceipt(order.id)}
                            className="p-3 bg-accent text-white rounded-xl hover:shadow-lg hover:shadow-accent/30 transition-all active:scale-95"
                            title="Confirm Receipt"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                        {((isAdmin && order.status !== 'Cancelled' && order.status !== 'Received') || (!isWarehouse && order.status === 'Pending')) && (
                          <button 
                            onClick={() => cancelOrder(order.id)}
                            className="p-3 bg-danger/10 text-danger rounded-xl hover:bg-danger hover:text-white transition-all active:scale-95"
                            title="Cancel Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-10 py-32 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-10">
                      <Search className="w-12 h-12" />
                      <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]">No order sequences located in local memory.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fulfillment Modal */}
      {fulfillingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFulfillingOrder(null)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-ink/5"
          >
            <div className="p-12 space-y-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-4xl font-serif font-medium text-ink italic">Fulfillment protocol</h3>
                  <p className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest mt-1">Adjusting supply magnitudes for #{String(fulfillingOrder.id).slice(0, 8)}</p>
                </div>
                <button onClick={() => setFulfillingOrder(null)} className="p-3 bg-background hover:bg-ink hover:text-white rounded-full transition-all active:scale-90">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="max-h-[40vh] overflow-y-auto pr-4 custom-scrollbar space-y-4">
                {fulfillmentItems.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={idx} className="p-6 bg-background rounded-2xl border border-ink/5 flex items-center justify-between gap-6">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono font-black uppercase tracking-widest text-primary mb-1">{product?.id}</p>
                        <h4 className="text-lg font-serif font-medium text-ink truncate italic">{product?.name}</h4>
                        <p className="text-[10px] font-mono font-bold text-ink/40 mt-1 uppercase tracking-tighter">Requested Quantity: {item.quantity}</p>
                      </div>
                      
                      <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-ink/5 shadow-sm">
                        <label className="text-[9px] font-mono font-black uppercase tracking-widest text-ink/30 px-3">Supplied</label>
                        <input 
                          type="number"
                          value={item.suppliedQuantity || 0}
                          onChange={(e) => updateItemSupply(idx, e.target.value)}
                          className="w-24 px-4 py-3 bg-background border-none rounded-lg text-xs font-mono font-bold text-ink focus:ring-2 focus:ring-primary/20 text-center"
                          min="0"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30 flex items-center gap-2">
                  <span>Logistics Notes</span>
                  <div className="h-px flex-1 bg-ink/5" />
                </label>
                <textarea 
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  className="w-full px-8 py-5 bg-background border border-ink/5 rounded-2xl text-xs font-medium focus:ring-4 focus:ring-primary/5 transition-all outline-none resize-none h-24"
                  placeholder="Observation notes for the destination node..."
                />
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  onClick={() => setFulfillingOrder(null)}
                  className="flex-1 py-5 bg-background text-ink/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-ink hover:text-white transition-all active:scale-95"
                >
                  Suspend protocol
                </button>
                <button 
                  onClick={handleFulfillSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-5 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:translate-y-[-1px] hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? <ArrowUpDown className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                  {isSubmitting ? 'Processing...' : 'Complete fulfillment'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Initiation Modal */}
      {showInitiateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowInitiateModal(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-ink/5"
          >
            <form onSubmit={handleInitiateSubmit} className="p-12 space-y-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-4xl font-serif font-medium text-ink italic">Initiate Requisition</h3>
                  <p className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest mt-1">Resource allocation request Protocol</p>
                </div>
                <button type="button" onClick={() => setShowInitiateModal(false)} className="p-3 bg-background hover:bg-ink hover:text-white rounded-full transition-all active:scale-90">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30 flex items-center gap-2">
                  <span>Destination Node</span>
                  <div className="h-px flex-1 bg-ink/5" />
                </label>
                <select 
                  required
                  value={newOrderBranch}
                  onChange={(e) => setNewOrderBranch(e.target.value)}
                  className="w-full px-8 py-5 bg-background border border-ink/5 rounded-2xl text-xs font-mono font-black uppercase tracking-widest focus:ring-4 focus:ring-primary/5 transition-all outline-none appearance-none"
                >
                  <option value="">SELECT BRANCH</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30 flex items-center gap-2 flex-1">
                    <span>Manifest items</span>
                    <div className="h-px flex-1 bg-ink/5" />
                  </label>
                  <button 
                    type="button"
                    onClick={addNewOrderItem}
                    className="ml-4 p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all active:scale-90"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar space-y-4">
                  {newOrderItems.map((item, idx) => (
                    <div key={idx} className="flex gap-4 items-end">
                      <div className="flex-1 space-y-1.5">
                        <select 
                          value={item.productId}
                          onChange={(e) => updateNewOrderItem(idx, 'productId', e.target.value)}
                          className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24 space-y-1.5">
                        <input 
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateNewOrderItem(idx, 'quantity', e.target.value)}
                          className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl text-xs font-mono font-bold text-center"
                          min="1"
                        />
                      </div>
                      <button 
                        type="button"
                        onClick={() => removeNewOrderItem(idx)}
                        className="p-4 text-danger/40 hover:text-danger hover:bg-danger/5 rounded-2xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {newOrderItems.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-ink/5 rounded-3xl">
                      <p className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/20 italic">No items in manifest.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30 flex items-center gap-2">
                  <span>Strategic Notes</span>
                  <div className="h-px flex-1 bg-ink/5" />
                </label>
                <textarea 
                  value={newOrderNotes}
                  onChange={(e) => setNewOrderNotes(e.target.value)}
                  className="w-full px-8 py-5 bg-background border border-ink/5 rounded-2xl text-xs font-medium focus:ring-4 focus:ring-primary/5 transition-all outline-none resize-none h-24"
                  placeholder="Context for fulfillment team..."
                />
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  type="button"
                  onClick={() => setShowInitiateModal(false)}
                  className="flex-1 py-5 bg-background text-ink/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-ink hover:text-white transition-all active:scale-95"
                >
                  Suspend protocol
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting || newOrderItems.length === 0}
                  className="flex-1 py-5 bg-ink text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:translate-y-[-1px] hover:shadow-xl transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? <ArrowUpDown className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isSubmitting ? 'Processing...' : 'Transmit Requisition'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

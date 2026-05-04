import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, ArrowUpDown } from 'lucide-react';

interface OrdersHistoryTableProps {
  orders: any[];
  branches: any[];
  products: any[];
}

export default function OrdersHistoryTable({ orders, branches, products }: OrdersHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredOrders = orders.filter(order => {
    const branch = branches.find(b => b.id === order.branch_id);
    const matchesSearch = branch?.name.toLowerCase().includes(search.toLowerCase()) || 
                          order.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));

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
            <option value="pending">PENDING</option>
            <option value="dispatched">DISPATCHED</option>
            <option value="cancelled">CANCELLED</option>
          </select>
        </div>
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
                      #{order.id.slice(0, 8)}
                    </td>
                    <td className="px-10 py-6">
                      <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-black uppercase tracking-widest text-ink/60">{branch?.name || '---'}</span>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex flex-wrap gap-2">
                        {order.items?.map((item: any, i: number) => {
                          const product = products.find(p => p.id === item.productId);
                          return (
                            <span key={i} className="text-[9px] font-mono font-black border border-ink/5 px-2 py-1 rounded-lg text-ink/40 group-hover:border-primary/20 group-hover:text-primary transition-all">
                              {item.quantity}× {product?.name || item.productId}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-mono font-black uppercase tracking-widest shadow-sm ${
                        order.status === 'pending' ? 'bg-warning/10 text-warning' :
                        order.status === 'dispatched' ? 'bg-primary/10 text-primary' :
                        order.status === 'received' ? 'bg-accent/10 text-accent' :
                        'bg-danger/10 text-danger'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right font-mono text-[10px] text-ink/40 space-y-1">
                      <div className="flex items-center justify-end gap-2 group-hover:text-ink transition-colors">
                        <span className="text-[8px] font-black uppercase opacity-40">Sent:</span>
                        <span className="font-bold">{order.dispatched_at ? new Date(order.dispatched_at).toLocaleString() : '---'}</span>
                      </div>
                      <div className="flex items-center justify-end gap-2 text-primary">
                        <span className="text-[8px] font-black uppercase opacity-40">Recv:</span>
                        <span className="font-bold">{order.received_at ? new Date(order.received_at).toLocaleString() : '---'}</span>
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
    </div>
  );
}

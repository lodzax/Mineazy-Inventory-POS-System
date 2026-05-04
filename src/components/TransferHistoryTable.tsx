import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, ArrowRightLeft, User, MessageSquare } from 'lucide-react';

interface TransferHistoryTableProps {
  transfers: any[];
  branches: any[];
  products: any[];
}

export default function TransferHistoryTable({ transfers, branches, products }: TransferHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');

  const filteredTransfers = transfers.filter(transfer => {
    const fromBranch = branches.find(b => b.id === transfer.from_branch_id);
    const toBranch = branches.find(b => b.id === transfer.to_branch_id);
    const matchesSearch = fromBranch?.name.toLowerCase().includes(search.toLowerCase()) || 
                          toBranch?.name.toLowerCase().includes(search.toLowerCase()) ||
                          transfer.id.toLowerCase().includes(search.toLowerCase());
    const matchesBranch = branchFilter === 'all' || 
                          transfer.from_branch_id === branchFilter || 
                          transfer.to_branch_id === branchFilter;
    return matchesSearch && matchesBranch;
  });

  const sortedTransfers = [...filteredTransfers].sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="relative w-full md:w-[450px]">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
          <input 
            type="text"
            placeholder="Search transfer logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-14 pr-6 py-5 bg-white border border-ink/5 rounded-[2rem] shadow-xl shadow-ink/[0.01] focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all font-medium text-xs"
          />
        </div>

        <div className="flex items-center gap-4 bg-white p-2 border border-ink/5 rounded-[1.5rem] shadow-xl shadow-ink/[0.01]">
          <Filter className="w-4 h-4 text-primary ml-3" />
          <select 
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-6 py-3 bg-background border-none rounded-xl font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ink focus:outline-none appearance-none cursor-pointer pr-12 min-w-[200px]"
          >
            <option value="all">ALL NODES</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-2xl shadow-ink/[0.02]">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background font-mono text-[9px] font-black uppercase tracking-[0.2em] text-ink/40">
                <th className="px-10 py-6">Audit Timestamp</th>
                <th className="px-10 py-6 text-primary tracking-tighter">Vector Route</th>
                <th className="px-10 py-6">Manifest Depth</th>
                <th className="px-10 py-6">Operator Ref</th>
                <th className="px-10 py-6">Audit Annotations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.03]">
              {sortedTransfers.map((transfer) => {
                const fromBranch = branches.find(b => b.id === transfer.from_branch_id);
                const toBranch = branches.find(b => b.id === transfer.to_branch_id);
                return (
                  <tr key={transfer.id} className="text-xs hover:bg-background transition-all group">
                    <td className="px-10 py-6 font-mono text-[10px] font-bold text-ink/40 group-hover:text-ink">
                      {transfer.timestamp ? new Date(transfer.timestamp).toLocaleString() : 'PENDING'}
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-black uppercase tracking-widest text-ink/60">{fromBranch?.name || '---'}</span>
                        <ArrowRightLeft className="w-4 h-4 text-primary opacity-30" />
                        <span className="px-3 py-1 bg-primary/10 rounded-full text-[9px] font-mono font-black uppercase tracking-widest text-primary">{toBranch?.name || '---'}</span>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex flex-wrap gap-2">
                        {transfer.items?.map((item: any, i: number) => {
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
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-ink/20">
                          <User className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-mono font-black text-ink/40 group-hover:text-ink uppercase tracking-widest transition-colors">System Op</span>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      {transfer.notes && (
                        <div className="flex items-start gap-3 max-w-xs bg-background/50 p-4 rounded-2xl border border-ink/[0.02]">
                          <MessageSquare className="w-4 h-4 text-primary opacity-20 mt-1 flex-shrink-0" />
                          <p className="text-[10px] font-medium text-ink/60 leading-relaxed italic">"{transfer.notes}"</p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedTransfers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-10 py-32 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-10">
                      <Search className="w-12 h-12" />
                      <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]">No logistic sequences detected.</p>
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

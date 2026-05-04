import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, Printer, User, Download, FileText, Calendar, ArrowRight } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SalesHistoryTableProps {
  sales: any[];
  branches: any[];
  products: any[];
}

export default function SalesHistoryTable({ sales, branches, products }: SalesHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredSales = sales.filter(sale => {
    const branch = branches.find(b => b.id === sale.branch_id);
    const saleDate = sale.timestamp ? new Date(sale.timestamp) : null;
    
    const matchesSearch = branch?.name.toLowerCase().includes(search.toLowerCase()) || 
                          sale.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
                          sale.id.toLowerCase().includes(search.toLowerCase());
    
    const matchesBranch = branchFilter === 'all' || sale.branch_id === branchFilter;
    
    const matchesProduct = productFilter === 'all' || 
                           sale.items?.some((item: any) => item.productId === productFilter);

    const matchesDate = (!startDate || (saleDate && saleDate >= new Date(startDate))) &&
                        (!endDate || (saleDate && saleDate <= new Date(new Date(endDate).setHours(23, 59, 59))));

    return matchesSearch && matchesBranch && matchesProduct && matchesDate;
  });

  const sortedSales = [...filteredSales].sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));

  const exportCSV = () => {
    const headers = ['Date', 'Sale ID', 'Branch', 'Cashier', 'Customer', 'Items', 'Total'];
    const rows = sortedSales.map(sale => {
      const branch = branches.find(b => b.id === sale.branch_id)?.name || 'Unknown';
      const itemsStr = sale.items?.map((item: any) => {
        const p = products.find(prod => prod.id === item.productId);
        return `${item.quantity}x ${p?.name || item.productId}`;
      }).join('; ');
      
      return [
        sale.timestamp ? new Date(sale.timestamp).toLocaleString() : '',
        sale.id,
        branch,
        sale.cashier_name || '---',
        sale.customer_name || 'Walk-in',
        itemsStr,
        sale.total.toFixed(2)
      ];
    });

    const grandTotal = sortedSales.reduce((sum, sale) => sum + (sale.total || 0), 0);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      `"","","","","","GRAND TOTAL","$${grandTotal.toFixed(2)}"`
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sales_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    const selectedBranchName = branchFilter === 'all' 
      ? 'All Branches' 
      : (branches.find(b => b.id === branchFilter)?.name || 'Unknown Branch');
    
    doc.setFontSize(24);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(`Sales Report for ${selectedBranchName}`, 14, 20);
    
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "bold");
    doc.text(`GENERATED ON: ${new Date().toLocaleString().toUpperCase()}`, 14, 28);
    
    const periodText = (startDate || endDate) 
      ? `AUDIT PERIOD: ${startDate || 'GENESIS'} TO ${endDate || 'PRESENT'}`
      : 'AUDIT PERIOD: FULL DATASET HISTORY';
    doc.text(periodText.toUpperCase(), 14, 34);

    const tableData = sortedSales.map(sale => {
      const branch = branches.find(b => b.id === sale.branch_id)?.name || 'N/A';
      const itemsStr = sale.items?.map((item: any) => {
        const p = products.find(prod => prod.id === item.productId);
        return `${item.quantity} ${p?.unit || ''} ${p?.name || item.productId}`;
      }).join('; ');
      
      return [
        sale.timestamp ? new Date(sale.timestamp).toLocaleString() : '',
        sale.id.slice(0, 8),
        branch.toUpperCase(),
        (sale.cashier_name || 'SYSTEM').toUpperCase(),
        (sale.customer_name || 'GENERAL GUEST').toUpperCase(),
        itemsStr,
        `$${sale.total.toFixed(2)}`
      ];
    });

    const grandTotal = sortedSales.reduce((sum, sale) => sum + (sale.total || 0), 0);

    autoTable(doc, {
      startY: 45,
      head: [['TIME STREAM', 'ID', 'BRANCH NODE', 'CASHIER REF', 'CLIENT', 'RESOURCE STREAM', 'MAGNITUDE']],
      body: tableData,
      foot: [['', '', '', '', '', 'TOTAL AGGREGATE MAGNITUDE', `$${grandTotal.toFixed(2)}`]],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 3 },
      columnStyles: { 6: { halign: 'right' } }
    });

    doc.save(`sales_audit_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
        <div className="lg:col-span-3 space-y-3">
          <label className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] ml-1">Search ID/Client/Node</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/20" />
            <input 
              type="text"
              placeholder="Query sequence..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-ink/5 rounded-2xl font-medium text-xs focus:ring-4 focus:ring-primary/5 transition-all shadow-xl shadow-ink/[0.01]"
            />
          </div>
        </div>

        <div className="lg:col-span-3 space-y-3">
          <label className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] ml-1">Temporal Range</label>
          <div className="flex items-center gap-3 bg-white p-1 rounded-2xl border border-ink/5 shadow-xl shadow-ink/[0.01]">
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 px-3 py-3 bg-background rounded-xl text-[10px] font-bold text-ink focus:outline-none uppercase"
            />
            <ArrowRight className="w-4 h-4 text-ink/10 flex-shrink-0" />
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 px-3 py-3 bg-background rounded-xl text-[10px] font-bold text-ink focus:outline-none uppercase"
            />
          </div>
        </div>

        <div className="lg:col-span-3 space-y-3">
          <label className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] ml-1">Contextual Filters</label>
          <div className="flex gap-3">
            <select 
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="flex-1 px-4 py-4 bg-white border border-ink/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-ink focus:ring-4 focus:ring-primary/5 transition-all shadow-xl shadow-ink/[0.01] appearance-none cursor-pointer"
            >
              <option value="all">Global Matrix</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
            </select>
            <select 
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="flex-1 px-4 py-4 bg-white border border-ink/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-ink focus:ring-4 focus:ring-primary/5 transition-all shadow-xl shadow-ink/[0.01] appearance-none cursor-pointer"
            >
              <option value="all">Every Artifact</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        <div className="lg:col-span-3 flex gap-3">
          <button 
            onClick={exportCSV}
            className="flex-1 px-4 py-4 bg-white border border-ink/5 text-ink rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-background transition-all shadow-xl shadow-ink/[0.01]"
          >
            <Download className="w-4 h-4 text-primary" />
            CSV Export
          </button>
          <button 
            onClick={exportPDF}
            className="flex-1 px-4 py-4 bg-ink text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:translate-y-[-2px] transition-all shadow-2xl shadow-ink/20"
          >
            <FileText className="w-4 h-4 text-primary" />
            PDF Audit
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-2xl shadow-ink/[0.02]">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background font-mono text-[9px] font-black uppercase tracking-[0.2em] text-ink/40">
                <th className="px-8 py-6">Audit Timestamp</th>
                <th className="px-8 py-6 text-primary">Stream ID</th>
                <th className="px-8 py-6">Branch Node</th>
                <th className="px-8 py-6">Cashier Ref</th>
                <th className="px-8 py-6">Client Identity</th>
                <th className="px-8 py-6">Material Flux</th>
                <th className="px-8 py-6 text-right">Net Magnitude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.03]">
              {sortedSales.map((sale) => {
                const branch = branches.find(b => b.id === sale.branch_id);
                return (
                  <tr key={sale.id} className="text-xs hover:bg-background transition-all group">
                    <td className="px-8 py-6 font-mono text-[10px] text-ink/40 font-bold group-hover:text-ink transition-colors">
                      {sale.timestamp ? new Date(sale.timestamp).toLocaleString() : 'PENDING'}
                    </td>
                    <td className="px-8 py-6 font-mono text-[10px] font-black text-ink uppercase tracking-tight">
                      #{sale.id.slice(0, 8)}
                    </td>
                    <td className="px-8 py-6">
                       <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-black uppercase tracking-widest text-ink/60">{branch?.name || '---'}</span>
                    </td>
                    <td className="px-8 py-6 font-mono text-[10px] font-black text-primary/60 italic">{sale.cashier_name || 'SYSTEM'}</td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-ink/20">
                          <User className="w-4 h-4" />
                        </div>
                        <span className="text-ink font-bold text-xs">{sale.customer_name || 'Walk-in'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {sale.items?.map((item: any, i: number) => {
                          const product = products.find(p => p.id === item.productId);
                          return (
                            <span key={i} className="text-[9px] font-mono font-black border border-ink/5 px-2 py-1 rounded-lg text-ink/40 group-hover:border-primary/20 group-hover:text-primary transition-all">
                              {item.quantity}× {product?.name || item.productId}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right font-mono font-black text-ink text-xl tracking-tighter">
                      ${(sale.total || 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
              {sortedSales.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-32 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <Search className="w-12 h-12" />
                      <p className="font-mono text-sm italic uppercase font-black tracking-widest">No matching auditory logs found.</p>
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

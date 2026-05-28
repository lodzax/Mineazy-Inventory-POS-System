import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, Printer, User, Download, FileText, Calendar, ArrowRight, Coins, Package, LineChart, TrendingUp, Layers } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import POSReceipt from './POSReceipt';

interface SalesHistoryTableProps {
  sales: any[];
  branches: any[];
  products: any[];
  profile: any;
}

export default function SalesHistoryTable({ sales, branches, products, profile }: SalesHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [summaryTab, setSummaryTab] = useState<'artifacts' | 'daily'>('artifacts');

  const isAdmin = profile?.role === 'Administrator';
  const userBranchId = profile?.branch_id;

  const handlePrintReceipt = (sale: any) => {
    setSelectedSale(sale);
    window.focus();
    document.body.classList.add('printing-receipt');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-receipt');
    }, 50);
  };

  const filteredSales = sales.filter(sale => {
    // Branch boundary check: only Admins see all, others only their branch
    if (!isAdmin && sale.branch_id !== userBranchId) {
      return false;
    }

    const branch = branches.find(b => b.id === sale.branch_id);
    const saleDate = sale.timestamp ? new Date(sale.timestamp) : null;
    
    const matchesSearch = branch?.name.toLowerCase().includes(search.toLowerCase()) || 
                          sale.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
                          sale.id.toString().toLowerCase().includes(search.toLowerCase());
    
    const matchesBranch = branchFilter === 'all' || sale.branch_id === branchFilter;
    
    const matchesProduct = productFilter === 'all' || 
                           sale.items?.some((item: any) => item.productId === productFilter);

    const matchesDate = (!startDate || (saleDate && saleDate >= new Date(startDate))) &&
                        (!endDate || (saleDate && saleDate <= new Date(new Date(endDate).setHours(23, 59, 59))));

    return matchesSearch && matchesBranch && matchesProduct && matchesDate;
  });

  const sortedSales = [...filteredSales].sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
  
  const totalPages = Math.ceil(sortedSales.length / itemsPerPage);
  const paginatedSales = sortedSales.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // 1. Core aggregates based on filteredSales / sortedSales
  const currentTotalRevenue = sortedSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  const currentTotalOrders = sortedSales.length;
  const currentTotalUnitsSold = sortedSales.reduce((sum, sale) => {
    return sum + (sale.items?.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0) || 0);
  }, 0);

  // 2. Artifact summary breakdown based on filteredSales / sortedSales
  const artifactSummaryMap = new Map<string, { id: string; quantity: number; revenue: number; name: string; unit: string; category: string }>();

  // Pre-populate products database to ensure name/unit mapping
  products.forEach(p => {
    artifactSummaryMap.set(p.id, {
      id: p.id,
      quantity: 0,
      revenue: 0,
      name: p.name,
      unit: p.unit,
      category: p.category || 'General'
    });
  });

  sortedSales.forEach(sale => {
    sale.items?.forEach((item: any) => {
      const existing = artifactSummaryMap.get(item.productId);
      const productDef = products.find(p => p.id === item.productId);
      
      const itemPrice = item.price || productDef?.price || 0;
      const itemRev = (item.quantity || 0) * itemPrice;
      
      if (existing) {
        existing.quantity += item.quantity || 0;
        existing.revenue += itemRev;
      } else {
        artifactSummaryMap.set(item.productId, {
          id: item.productId,
          quantity: item.quantity || 0,
          revenue: itemRev,
          name: productDef?.name || item.productId,
          unit: productDef?.unit || 'unit',
          category: productDef?.category || 'General'
        });
      }
    });
  });

  const artifactSummaries = Array.from(artifactSummaryMap.values())
    .filter(item => item.quantity > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // 3. Daily Sales Totals calculation
  const dailySummaryMap = new Map<string, { 
    dateStr: string; 
    totalRevenue: number; 
    transactionCount: number; 
    unitsSold: number;
    branchBreakdown: { [branchId: string]: { name: string; revenue: number; count: number } };
  }>();

  sortedSales.forEach(sale => {
    if (!sale.timestamp) return;
    const dateObj = new Date(sale.timestamp);
    const dateKey = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    
    const branch = branches.find(b => b.id === sale.branch_id);
    const branchName = branch?.name || 'Unknown Branch';
    
    const saleUnits = sale.items?.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0) || 0;
    
    const existing = dailySummaryMap.get(dateKey);
    if (existing) {
      existing.totalRevenue += sale.total || 0;
      existing.transactionCount += 1;
      existing.unitsSold += saleUnits;
      
      if (existing.branchBreakdown[sale.branch_id]) {
        existing.branchBreakdown[sale.branch_id].revenue += sale.total || 0;
        existing.branchBreakdown[sale.branch_id].count += 1;
      } else {
        existing.branchBreakdown[sale.branch_id] = {
          name: branchName,
          revenue: sale.total || 0,
          count: 1
        };
      }
    } else {
      const branchBreakdown: { [branchId: string]: { name: string; revenue: number; count: number } } = {};
      branchBreakdown[sale.branch_id] = {
        name: branchName,
        revenue: sale.total || 0,
        count: 1
      };
      
      dailySummaryMap.set(dateKey, {
        dateStr: dateKey,
        totalRevenue: sale.total || 0,
        transactionCount: 1,
        unitsSold: saleUnits,
        branchBreakdown
      });
    }
  });

  const dailySummaries = Array.from(dailySummaryMap.values()).sort((a, b) => {
    return new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime();
  });

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
        sale.id.toString().slice(0, 8),
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
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
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
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="flex-1 px-3 py-3 bg-background rounded-xl text-[10px] font-bold text-ink focus:outline-none uppercase"
            />
            <ArrowRight className="w-4 h-4 text-ink/10 flex-shrink-0" />
            <input 
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="flex-1 px-3 py-3 bg-background rounded-xl text-[10px] font-bold text-ink focus:outline-none uppercase"
            />
          </div>
        </div>

        {isAdmin && (
          <div className="lg:col-span-3 space-y-3 font-mono">
            <label className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] ml-1">Contextual Filters</label>
            <div className="flex gap-3">
              <select 
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value); setCurrentPage(1); }}
                className="flex-1 px-4 py-4 bg-white border border-ink/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-ink focus:ring-4 focus:ring-primary/5 transition-all shadow-xl shadow-ink/[0.01] appearance-none cursor-pointer"
              >
                <option value="all">Global Matrix</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
              </select>
              <select 
                value={productFilter}
                onChange={(e) => { setProductFilter(e.target.value); setCurrentPage(1); }}
                className="flex-1 px-4 py-4 bg-white border border-ink/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-ink focus:ring-4 focus:ring-primary/5 transition-all shadow-xl shadow-ink/[0.01] appearance-none cursor-pointer"
              >
                <option value="all">Every Artifact</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
        )}

        {!isAdmin && (
          <div className="lg:col-span-3 space-y-3 font-mono">
            <label className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] ml-1">Contextual Filters</label>
            <select 
              value={productFilter}
              onChange={(e) => { setProductFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-4 py-4 bg-white border border-ink/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-ink focus:ring-4 focus:ring-primary/5 transition-all shadow-xl shadow-ink/[0.01] appearance-none cursor-pointer"
            >
              <option value="all">Every Artifact</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>)}
            </select>
          </div>
        )}

        <div className="lg:col-span-3 flex gap-3">
          <button 
            onClick={() => { window.focus(); window.print(); }}
            className="flex-1 px-4 py-4 bg-ink text-white border border-ink/5 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95 no-print"
          >
            <Printer className="w-4 h-4 text-primary" />
            Print Audit
          </button>
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

      {/* Running Sales Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Net Running revenue */}
        <div className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.01] flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase font-black tracking-widest text-ink/30">Running Net Revenue</p>
            <p className="text-3xl font-serif font-black text-ink mt-0.5">${currentTotalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* KPI 2: Artifact Volume Transacted */}
        <div className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.01] flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase font-black tracking-widest text-ink/30">Artifact Volume Sold</p>
            <p className="text-3xl font-serif font-black text-ink mt-0.5">{currentTotalUnitsSold.toLocaleString()} <span className="text-xs font-sans text-ink-muted">units</span></p>
          </div>
        </div>

        {/* KPI 3: Mean Order Value */}
        <div className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.01] flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase font-black tracking-widest text-ink/30">Total Transactions</p>
            <p className="text-3xl font-serif font-black text-ink mt-0.5">{currentTotalOrders.toLocaleString()} <span className="text-xs font-sans text-ink-muted">audits</span></p>
          </div>
        </div>
      </div>

      {/* Breakdown by Artifact & Daily sales list view */}
      <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-2xl shadow-ink/[0.02] p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink/5 pb-4">
          <div>
            <h3 className="text-lg font-serif font-bold text-ink">Analytical Breakdown Matrix</h3>
            <p className="text-[11px] text-ink/40 font-mono uppercase tracking-wider mt-0.5">Statistical insights from active filtered context</p>
          </div>
          
          <div className="flex bg-background p-1 rounded-xl border border-ink/5 w-fit">
            <button
              onClick={() => setSummaryTab('artifacts')}
              className={`px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                summaryTab === 'artifacts'
                  ? 'bg-ink text-white shadow-md shadow-ink/10'
                  : 'text-ink/40 hover:text-ink'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              By Artifact / Product
            </button>
            <button
              onClick={() => setSummaryTab('daily')}
              className={`px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                summaryTab === 'daily'
                  ? 'bg-ink text-white shadow-md shadow-ink/10'
                  : 'text-ink/40 hover:text-ink'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Daily Sales Ledger
            </button>
          </div>
        </div>

        {summaryTab === 'artifacts' ? (
          <div className="space-y-4">
            {artifactSummaries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {artifactSummaries.map((art) => {
                  const percentOfTotal = currentTotalRevenue > 0 
                    ? ((art.revenue / currentTotalRevenue) * 100).toFixed(1) 
                    : '0';
                  return (
                    <div key={art.id} className="p-4 rounded-xl border border-ink/5 bg-background/30 hover:bg-background transition-all group flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs font-bold text-ink truncate max-w-[70%]" title={art.name}>
                            {art.name}
                          </span>
                          <span className="text-[9px] font-mono uppercase font-black px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                            {art.category}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-ink-muted">ID: {art.id.slice(0, 8)}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-ink/5 flex items-end justify-between">
                        <div>
                          <p className="text-[9px] font-mono uppercase tracking-wider text-ink/30">Volume Traded</p>
                          <p className="text-sm font-bold text-ink">{art.quantity} {art.unit}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-mono uppercase tracking-wider text-ink/30">Total Magnitude</p>
                          <p className="text-lg font-serif font-black text-primary">${art.revenue.toFixed(2)}</p>
                          <p className="text-[9px] font-mono text-accent font-bold">{percentOfTotal}% of total</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-ink/30 font-mono text-xs uppercase tracking-widest italic">
                No active artifact transacted in the current calendar subset.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {dailySummaries.length > 0 ? (
              <div className="divide-y divide-ink/5">
                {dailySummaries.map((day) => (
                  <div key={day.dateStr} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold text-ink">{day.dateStr}</span>
                        {day.dateStr === new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) && (
                          <span className="text-[8px] font-mono uppercase font-black px-2 py-0.5 bg-accent/10 text-accent rounded-full">Today</span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-ink-muted">
                        {day.transactionCount} Orders • {day.unitsSold} Resource Units Transacted
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* Show branch breakdown for Admins/HQ or multiple branch scopes */}
                      {isAdmin && Object.keys(day.branchBreakdown).length > 1 && (
                        <div className="flex flex-wrap gap-2 mr-4 border-r border-ink/5 pr-4 md:max-w-md lg:max-w-xl">
                          {Object.entries(day.branchBreakdown).map(([branchId, info]) => (
                            <div key={branchId} className="px-2.5 py-1 bg-ink/5 rounded-lg border border-ink/5 flex items-center gap-1.5 text-[9px] font-mono font-bold text-ink-muted">
                              <span className="uppercase text-ink h-auto inline">{info.name.split(' ')[0]}</span>
                              <span className="text-primary">${info.revenue.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="text-right">
                        <p className="text-[9px] font-mono uppercase tracking-wider text-ink/30">Daily Running Revenue</p>
                        <p className="text-xl font-serif font-black text-ink">${day.totalRevenue.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-ink/30 font-mono text-xs uppercase tracking-widest italic">
                No calendar dates match the specified temporal filter.
              </div>
            )}
          </div>
        )}
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
              {paginatedSales.map((sale) => {
                const branch = branches.find(b => b.id === sale.branch_id);
                return (
                  <tr key={sale.id} className="text-xs hover:bg-background transition-all group">
                    <td className="px-8 py-6 font-mono text-[10px] text-ink/40 font-bold group-hover:text-ink transition-colors">
                      {sale.timestamp ? new Date(sale.timestamp).toLocaleString() : 'PENDING'}
                    </td>
                    <td className="px-8 py-6 font-mono text-[10px] font-black text-ink uppercase tracking-tight">
                      #{sale.id.toString().slice(0, 8)}
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
                      <div className="flex items-center justify-end gap-4">
                        <button 
                          onClick={() => handlePrintReceipt(sale)}
                          className="flex items-center gap-2 px-3 py-2 bg-ink text-white hover:bg-primary transition-all rounded-xl no-print shadow-lg shadow-ink/10"
                          title="Reprint POS Receipt"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Receipt</span>
                        </button>
                        <span>${(sale.total || 0).toFixed(2)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedSales.length === 0 && (
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

        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="px-8 py-6 bg-background/50 border-t border-ink/5 flex items-center justify-between no-print">
            <div className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">
              Showing <span className="text-ink">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-ink">{Math.min(currentPage * itemsPerPage, sortedSales.length)}</span> of <span className="text-ink">{sortedSales.length}</span> entries
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white border border-ink/5 rounded-lg text-ink disabled:opacity-20 transition-all hover:bg-ink hover:text-white"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-[10px] font-mono font-black transition-all ${
                      currentPage === page 
                        ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                        : 'bg-white border border-ink/5 text-ink/40 hover:text-ink'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 bg-white border border-ink/5 rounded-lg text-ink disabled:opacity-20 transition-all hover:bg-ink hover:text-white"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <POSReceipt 
        sale={selectedSale}
        branch={branches.find(b => b.id === selectedSale?.branch_id)}
        cashier={selectedSale?.cashier_name || 'System User'}
        products={products}
      />
    </div>
  );
}

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  PackageCheck, 
  Truck, 
  X, 
  Plus, 
  Trash2, 
  Send, 
  Printer, 
  FileText,
  FileDown,
  Building2,
  Calendar,
  Layers,
  TrendingUp,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertCircle,
  Inbox,
  BarChart3,
  PieChart,
  ShoppingBag
} from 'lucide-react';
import { generateInvoicePDF } from '../lib/invoiceGenerator';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrdersHistoryTableProps {
  orders: any[];
  branches: any[];
  products: any[];
  profiles: any[];
  initiateOrder: (branchId: string, items: any[], notes: string) => Promise<any>;
  processOrder: (orderId: string | number, items: any[], notes: string) => void;
  cancelOrder: (orderId: string | number, reason?: string) => void;
  confirmReceipt: (orderId: string | number) => void;
  profile: any;
  supplyOrders?: any[];
}

export default function OrdersHistoryTable({ 
  orders, 
  branches, 
  products, 
  profiles,
  initiateOrder,
  processOrder, 
  cancelOrder, 
  confirmReceipt, 
  profile,
  supplyOrders = []
}: OrdersHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [matrixTab, setMatrixTab] = useState<'branches' | 'products'>('branches');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [processingOrder, setProcessingOrder] = useState<any | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [processingItems, setProcessingItems] = useState<any[]>([]);
  const [fNotes, setFNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [newOrderBranch, setNewOrderBranch] = useState<string>('');

  // Sync branch for limited roles only once or when profile/branches change initially
  React.useEffect(() => {
    if (!newOrderBranch) {
      if (profile?.branch_id) {
        setNewOrderBranch(profile.branch_id.toLowerCase());
      } else if (branches.length > 0) {
        setNewOrderBranch(branches[0].id);
      }
    }
  }, [profile, branches]);

  const [newOrderItems, setNewOrderItems] = useState<{ productId: string, quantity: number }[]>([]);
  const [newOrderNotes, setNewOrderNotes] = useState('');

  const isWarehouse = profile?.role?.toLowerCase() === 'warehouse' || 
                      profile?.role?.toLowerCase() === 'administrator' || 
                      profile?.role?.toLowerCase() === 'manager';

  const isAdmin = profile?.role?.toLowerCase() === 'administrator' || 
                  profile?.role?.toLowerCase() === 'manager';

  const isLimitedRole = profile?.role === 'Supervisor' || profile?.role === 'Cashier';

  const filteredOrders = orders.filter(order => {
    // Branch boundary check: Supervisors and Cashiers only see their own branch
    if (isLimitedRole && profile?.branch_id && order.branch_id !== profile.branch_id) {
      return false;
    }

    const branch = branches.find(b => b.id === order.branch_id);
    const matchesSearch = branch?.name.toLowerCase().includes(search.toLowerCase()) || 
                          order.id.toString().toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesBranch = branchFilter === 'all' || order.branch_id === branchFilter;
    
    let matchesDate = true;
    if (dateFilter && order.created_at) {
      const orderDate = new Date(order.created_at).toISOString().split('T')[0];
      matchesDate = orderDate === dateFilter;
    }

    return matchesSearch && matchesStatus && matchesBranch && matchesDate;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));
  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  const paginatedOrders = sortedOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // =========================================================
  // DYNAMIC FILTERED METRICS, ANALYSIS & STATISTICAL INSIGHTS
  // =========================================================
  const totalFilteredOrders = sortedOrders.length;
  const pendingCount = sortedOrders.filter(o => o.status === 'Pending').length;
  const inTransitCount = sortedOrders.filter(o => o.status === 'In-Transit').length;
  const receivedCount = sortedOrders.filter(o => o.status === 'Received').length;
  const cancelledCount = sortedOrders.filter(o => o.status === 'Cancelled').length;

  let totalUnitsRequested = 0;
  let totalUnitsSupplied = 0;
  let totalPurchasedUnits = 0;

  const productDemandMap: Record<string, { requested: number; supplied: number; purchased: number }> = {};
  const branchMetricsMap: Record<string, { total: number; pending: number; inTransit: number; received: number; cancelled: number }> = {};

  // Initialize with zeros for all products so they exist
  products.forEach(p => {
    productDemandMap[p.id] = { requested: 0, supplied: 0, purchased: 0 };
  });

  sortedOrders.forEach(order => {
    const bId = order.branch_id;
    if (!branchMetricsMap[bId]) {
      branchMetricsMap[bId] = { total: 0, pending: 0, inTransit: 0, received: 0, cancelled: 0 };
    }
    branchMetricsMap[bId].total += 1;
    if (order.status === 'Pending') branchMetricsMap[bId].pending += 1;
    else if (order.status === 'In-Transit') branchMetricsMap[bId].inTransit += 1;
    else if (order.status === 'Received') branchMetricsMap[bId].received += 1;
    else if (order.status === 'Cancelled') branchMetricsMap[bId].cancelled += 1;

    order.items?.forEach((it: any) => {
      const qty = parseFloat(it.quantity) || 0;
      const supQty = parseFloat(it.suppliedQuantity !== undefined ? it.suppliedQuantity : it.quantity) || 0;
      
      totalUnitsRequested += qty;
      if (order.status !== 'Pending' && order.status !== 'Cancelled') {
        totalUnitsSupplied += supQty;
      }

      const pId = it.productId;
      if (!productDemandMap[pId]) {
        productDemandMap[pId] = { requested: 0, supplied: 0, purchased: 0 };
      }
      productDemandMap[pId].requested += qty;
      if (order.status !== 'Pending' && order.status !== 'Cancelled') {
        productDemandMap[pId].supplied += supQty;
      }
    });
  });

  // Calculate units received from purchasing (supplyOrders)
  supplyOrders.forEach(so => {
    if (so.status !== 'Received') return;

    // Filter by branch limits
    if (isLimitedRole && profile?.branch_id && so.destination_branch_id !== profile.branch_id) {
      return;
    }
    if (branchFilter !== 'all' && so.destination_branch_id !== branchFilter) {
      return;
    }

    // Filter by date
    if (dateFilter) {
      const soDate = so.date_of_supply ? new Date(so.date_of_supply).toISOString().split('T')[0] : '';
      if (soDate !== dateFilter) {
        return;
      }
    }

    so.items?.forEach((it: any) => {
      const pId = it.productId;
      if (!pId) return;
      const qty = parseFloat(it.quantity) || 0;
      
      totalPurchasedUnits += qty;

      if (!productDemandMap[pId]) {
        productDemandMap[pId] = { requested: 0, supplied: 0, purchased: 0 };
      }
      productDemandMap[pId].purchased += qty;
    });
  });

  const resolvedCount = receivedCount + cancelledCount;
  const fulfillmentRate = resolvedCount > 0 
    ? Math.round((receivedCount / resolvedCount) * 100) 
    : totalFilteredOrders > 0 
      ? Math.round((receivedCount / totalFilteredOrders) * 100) 
      : 100;

  const avgItemsPerOrder = totalFilteredOrders > 0 
    ? (totalUnitsRequested / totalFilteredOrders).toFixed(1) 
    : '0.0';

  // Find Peak Demand Branch
  let peakBranchId = '';
  let maxBranchOrders = 0;
  Object.entries(branchMetricsMap).forEach(([bId, metrics]) => {
    if (metrics.total > maxBranchOrders) {
      maxBranchOrders = metrics.total;
      peakBranchId = bId;
    }
  });
  const peakBranch = branches.find(b => b.id === peakBranchId);

  // Find Top Demanded Product
  let topProductId = '';
  let maxProductQty = 0;
  Object.entries(productDemandMap).forEach(([pId, demand]) => {
    if (demand.requested > maxProductQty) {
      maxProductQty = demand.requested;
      topProductId = pId;
    }
  });
  const topProduct = products.find(p => p.id === topProductId);

  // Filter out products with no activity in this context (to keep table concise and relevant)
  const activeProductEntries = Object.entries(productDemandMap).filter(([_, demand]) => {
    return demand.requested > 0 || demand.supplied > 0 || demand.purchased > 0;
  });
  // =========================================================

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('STOCK MANAGEMENT ORDER LOGS', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 28, { align: 'center' });
    
    // Filters Header
    let filterString = "Active Filters: ";
    if (statusFilter !== 'all') filterString += `Status: ${statusFilter} | `;
    if (branchFilter !== 'all') filterString += `Branch: ${branches.find(b => b.id === branchFilter)?.name || branchFilter} | `;
    if (dateFilter) filterString += `Date: ${dateFilter} | `;
    if (filterString === "Active Filters: ") filterString += "None";
    
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(filterString, 105, 35, { align: 'center' });

    const tableData = sortedOrders.map(order => {
      const branch = branches.find(b => b.id === order.branch_id);
      return [
        new Date(order.created_at).toLocaleString(),
        `#${order.id.toString().slice(0, 8)}`,
        branch?.name || order.branch_id,
        order.items.map((it: any) => {
          const product = products.find(p => p.id === it.productId);
          return `${it.quantity}x ${product?.name || it.productId}`;
        }).join('\n'),
        order.status.toUpperCase()
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Timestamp', 'Order ID', 'Branch Node', 'Manifest Content', 'Protocol Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 2 },
    });

    doc.save(`order_history_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const openProcessing = (order: any) => {
    setProcessingOrder(order);
    setProcessingItems(order.items.map((item: any) => ({
      ...item,
      suppliedQuantity: item.suppliedQuantity ?? item.quantity
    })));
    setFNotes(order.notes || '');
  };

  const handleProcessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!processingOrder) return;
    setIsSubmitting(true);
    try {
      const cleanedItems = processingItems.map(({ isNew, ...rest }) => rest);
      await processOrder(processingOrder.id, cleanedItems, fNotes);
      setProcessingOrder(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateItemSupply = (idx: number, val: string) => {
    const newItems = [...processingItems];
    const parsed = parseFloat(val);
    newItems[idx].suppliedQuantity = isNaN(parsed) ? 0 : parsed;
    setProcessingItems(newItems);
  };

  const addItemToProcessing = () => {
    if (!products.length) return;
    setProcessingItems([...processingItems, { 
      productId: products[0].id, 
      quantity: 0, 
      suppliedQuantity: 1, 
      isNew: true 
    }]);
  };

  const removeItemFromProcessing = (idx: number) => {
    setProcessingItems(processingItems.filter((_, i) => i !== idx));
  };

  const updateProcessingItemProduct = (idx: number, productId: string) => {
    const newItems = [...processingItems];
    newItems[idx].productId = productId;
    setProcessingItems(newItems);
  };

  const handleCancelSubmit = async () => {
    if (!cancellingOrder) return;
    setIsSubmitting(true);
    try {
      await cancelOrder(cancellingOrder.id, cancellationReason);
      setCancellingOrder(null);
      setCancellationReason('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInitiateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderBranch || newOrderItems.length === 0) return;
    setIsSubmitting(true);
    try {
      const order = await initiateOrder(newOrderBranch, newOrderItems, newOrderNotes);
      if (order && isWarehouse) {
        // Auto-generate invoice for warehouse users
        const branch = branches.find(b => b.id === newOrderBranch);
        generateInvoicePDF(order, branch, products, profiles);
      }
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
    if (field === 'quantity') {
      const parsed = parseFloat(val);
      (items[idx] as any)[field] = isNaN(parsed) ? 0 : parsed;
    } else {
      (items[idx] as any)[field] = val;
    }
    setNewOrderItems(items);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5 no-print">
        <div className="flex items-center gap-3 mb-6">
          <Filter className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-serif font-medium">Refine Orders</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {isAdmin && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">By node</label>
              <div className="relative">
                <select 
                  value={branchFilter}
                  onChange={(e) => { setBranchFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
                >
                  <option value="all">All Branches</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Protocol Status</label>
            <div className="relative">
              <select 
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
              >
                <option value="all">Any Status</option>
                <option value="Pending">Pending</option>
                <option value="In-Transit">In-Transit</option>
                <option value="Received">Received</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Specific Date</label>
            <div className="relative">
              <input 
                type="date"
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs"
              />
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Search ID/Name</label>
            <div className="relative">
              <input 
                type="text"
                placeholder="Search stream..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            </div>
          </div>
        </div>

        {(branchFilter !== 'all' || statusFilter !== 'all' || dateFilter || search) && (
          <div className="mt-6 flex justify-end">
            <button 
              onClick={() => {
                setBranchFilter('all');
                setStatusFilter('all');
                setDateFilter('');
                setSearch('');
              }}
              className="text-[10px] font-mono font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-2"
            >
              <X className="w-3 h-3" />
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Dynamic Context Analytics */}
      <div className="space-y-6 no-print">
        {/* 1. Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Volume */}
          <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-lg shadow-ink/[0.01] flex items-start gap-4">
            <div className="p-3 bg-primary/10 text-primary rounded-2xl">
              <Inbox className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Active Context</span>
              <span className="block text-2xl font-serif font-semibold italic text-ink">{totalFilteredOrders} <span className="text-xs font-mono font-black tracking-tighter not-italic text-ink/40">ORDERS</span></span>
              <span className="block text-[10px] font-mono text-ink/50 uppercase">{totalUnitsRequested} Total Units Demanded</span>
            </div>
          </div>

          {/* Card 2: Pipeline queue */}
          <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-lg shadow-ink/[0.01] flex items-start gap-4">
            <div className="p-3 bg-secondary/10 text-secondary rounded-2xl">
              <Truck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Active Pipeline</span>
              <span className="block text-2xl font-serif font-semibold italic text-ink">{pendingCount + inTransitCount} <span className="text-xs font-mono font-black tracking-tighter not-italic text-ink/40">QUEUED</span></span>
              <span className="block text-[10px] font-mono text-ink/50 uppercase">{pendingCount} Pending / {inTransitCount} In Transit</span>
            </div>
          </div>

          {/* Card 3: Successfully completed */}
          <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-lg shadow-ink/[0.01] flex items-start gap-4">
            <div className="p-3 bg-accent/10 text-accent rounded-2xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Fulfillments</span>
              <span className="block text-2xl font-serif font-semibold italic text-ink">{receivedCount} <span className="text-xs font-mono font-black tracking-tighter not-italic text-ink/40">RECEIVED</span></span>
              <span className="block text-[10px] font-mono text-ink/50 uppercase">{totalUnitsSupplied} Delivered / {totalPurchasedUnits} Procured</span>
            </div>
          </div>

          {/* Card 4: Integrity/Fulfillment speed */}
          <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-lg shadow-ink/[0.01] flex items-start gap-4">
            <div className="p-3 bg-warning/10 text-warning rounded-2xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Integrity Index</span>
              <span className="block text-2xl font-serif font-semibold italic text-ink">{fulfillmentRate}% <span className="text-xs font-mono font-black tracking-tighter not-italic text-ink/40">RATE</span></span>
              <span className="block text-[10px] font-mono text-ink/50 uppercase">Avg {avgItemsPerOrder} Items per Order</span>
            </div>
          </div>
        </div>

        {/* 2. Analytical Breakdown Matrix & Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Breakdown Matrix */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col h-[32rem]">
            <div className="flex items-center justify-between border-b border-ink/5 pb-5 mb-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-serif font-medium text-ink">Breakdown Matrix</h3>
              </div>
              <div className="flex bg-background p-1 rounded-xl border border-ink/5">
                <button
                  type="button"
                  onClick={() => setMatrixTab('branches')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
                    matrixTab === 'branches' 
                      ? 'bg-white text-ink shadow-sm' 
                      : 'text-ink/40 hover:text-ink'
                  }`}
                >
                  Nodes
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixTab('products')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
                    matrixTab === 'products' 
                      ? 'bg-white text-ink shadow-sm' 
                      : 'text-ink/40 hover:text-ink'
                  }`}
                >
                  SKU Demand
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {matrixTab === 'branches' ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-ink/5 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-ink/30">
                      <th className="pb-3">Branch Node</th>
                      <th className="pb-3 text-center">Total</th>
                      <th className="pb-3 text-center">Pending</th>
                      <th className="pb-3 text-center text-secondary">In Transit</th>
                      <th className="pb-3 text-center text-accent">Received</th>
                      <th className="pb-3 text-right text-danger">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/[0.03]">
                    {branches.map(b => {
                      const metrics = branchMetricsMap[b.id] || { total: 0, pending: 0, inTransit: 0, received: 0, cancelled: 0 };
                      return (
                        <tr key={b.id} className="hover:bg-background/40 transition-all text-xs">
                          <td className="py-3 font-semibold text-ink">{b.name}</td>
                          <td className="py-3 text-center font-mono font-bold text-ink/60">{metrics.total}</td>
                          <td className="py-3 text-center font-mono font-bold">
                            <span className={metrics.pending > 0 ? 'text-warning' : 'text-ink/20'}>{metrics.pending}</span>
                          </td>
                          <td className="py-3 text-center font-mono font-bold">
                            <span className={metrics.inTransit > 0 ? 'text-secondary' : 'text-ink/20'}>{metrics.inTransit}</span>
                          </td>
                          <td className="py-3 text-center font-mono font-bold">
                            <span className={metrics.received > 0 ? 'text-accent' : 'text-ink/20'}>{metrics.received}</span>
                          </td>
                          <td className="py-3 text-right font-mono font-bold">
                            <span className={metrics.cancelled > 0 ? 'text-danger' : 'text-ink/20'}>{metrics.cancelled}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {branches.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-ink/30 font-mono text-[10px] uppercase">No active nodes listed</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-ink/5 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-ink/30">
                      <th className="pb-3">Product Name</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3 text-center">Units Demanded</th>
                      <th className="pb-3 text-center text-accent">Units Dispatched</th>
                      <th className="pb-3 text-right text-indigo-600">Recv (Purchasing)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/[0.03]">
                    {activeProductEntries.map(([pId, demand]) => {
                      const prod = products.find(p => p.id === pId);
                      return (
                        <tr key={pId} className="hover:bg-background/40 transition-all text-xs">
                          <td className="py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-ink">{prod?.name || pId}</span>
                              <span className="text-[9px] font-mono text-ink/30 uppercase">{pId.slice(0, 12)}...</span>
                            </div>
                          </td>
                          <td className="py-3 text-ink/50 text-[10px] uppercase font-mono">{prod?.category || 'General'}</td>
                          <td className="py-3 text-center font-mono font-bold text-ink">{demand.requested}</td>
                          <td className="py-3 text-center font-mono font-bold text-accent">{demand.supplied}</td>
                          <td className="py-3 text-right font-mono font-bold text-indigo-600">
                            {demand.purchased > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-mono font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                                {demand.purchased}
                              </span>
                            ) : (
                              <span className="text-ink/20">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {activeProductEntries.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-ink/30 font-mono text-[10px] uppercase">No product requests or purchases matching context</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Statistical Insights */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col h-[32rem]">
            <div className="flex items-center gap-3 border-b border-ink/5 pb-5 mb-6">
              <Sparkles className="w-5 h-5 text-warning" />
              <h3 className="text-xl font-serif font-medium text-ink">Statistical Insights</h3>
            </div>
            
             <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2">
              {totalFilteredOrders > 0 || totalPurchasedUnits > 0 ? (
                <>
                  {totalFilteredOrders > 0 && (
                    <>
                      <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10 flex gap-4 items-start">
                        <Activity className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-xs font-mono font-black uppercase tracking-widest text-primary">Peak Demand Driver</h4>
                          <p className="text-xs text-ink/70 leading-relaxed">
                            {peakBranch ? (
                              <>
                                The node <strong className="text-ink font-semibold">{peakBranch.name}</strong> represents the highest order frequency, driving <strong className="text-ink font-bold">{maxBranchOrders} requisition sequences</strong> ({Math.round((maxBranchOrders / totalFilteredOrders) * 100)}% of the current filtered volume).
                              </>
                            ) : (
                              "Volume is distributed evenly across multiple requesting branch nodes in this context."
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="p-5 bg-secondary/5 rounded-2xl border border-secondary/10 flex gap-4 items-start">
                        <ShoppingBag className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-xs font-mono font-black uppercase tracking-widest text-secondary">Core Inventory Asset</h4>
                          <p className="text-xs text-ink/70 leading-relaxed">
                            {topProduct ? (
                              <>
                                Demand intensity is focused on <strong className="text-ink font-semibold">{topProduct.name}</strong>, with a cumulative requested volume of <strong className="text-ink font-bold">{maxProductQty} {topProduct.unit || 'units'}</strong> across all active requisitions.
                              </>
                            ) : (
                              "Detailed demand distribution statistics are currently flat or equalized in this context range."
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="p-5 bg-accent/5 rounded-2xl border border-accent/10 flex gap-4 items-start">
                        <PieChart className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-xs font-mono font-black uppercase tracking-widest text-accent">Fulfillment Efficacy</h4>
                          <p className="text-xs text-ink/70 leading-relaxed">
                            Of all resolved logistics protocols, <strong className="text-ink font-bold">{fulfillmentRate}%</strong> have reached successful handshakes and are confirmed received. There are currently <strong className="text-ink font-bold">{pendingCount} orders pending</strong> in the queue and <strong className="text-ink font-bold">{inTransitCount} orders in-transit</strong>.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {totalPurchasedUnits > 0 && (
                    <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-4 items-start">
                      <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-xs font-mono font-black uppercase tracking-widest text-indigo-600">Purchasing Velocity</h4>
                        <p className="text-xs text-ink/70 leading-relaxed">
                          A total of <strong className="text-indigo-700 font-bold">{totalPurchasedUnits} units</strong> have been successfully procured and received from external suppliers in the active context, reinforcing warehouse stock buffers.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
                  <AlertCircle className="w-10 h-10 text-ink/30 mb-3" />
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] max-w-[20rem]">
                    No enough transactional records or purchases found in active context to formulate statistical insights.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <button 
            onClick={exportToPDF}
            className="px-8 py-4 bg-primary text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95"
          >
            <FileDown className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
          <button 
            onClick={() => { window.focus(); window.print(); }}
            className="px-8 py-4 bg-ink text-white border border-ink/5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95"
          >
            <Printer className="w-4 h-4 text-primary" />
            <span>Print Audit</span>
          </button>
        </div>

        <button 
          onClick={() => setShowInitiateModal(true)}
          className="px-8 py-5 bg-ink text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95 w-full md:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Initiate Requisition</span>
        </button>
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
              {paginatedOrders.map((order) => {
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
                        order.status === 'In-Transit' ? 'bg-secondary/10 text-secondary' :
                        order.status === 'Received' ? 'bg-accent/10 text-accent' :
                        'bg-danger/10 text-danger'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right space-y-1">
                      <div className="flex items-center justify-end gap-2">
                        {isWarehouse && (order.status === 'In-Transit' || order.status === 'Received') && (
                          <button 
                            onClick={() => generateInvoicePDF(order, branch, products, profiles)}
                            className="p-3 bg-secondary/10 text-secondary rounded-xl hover:bg-secondary hover:text-white transition-all active:scale-95"
                            title="Download Invoice"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                        {isWarehouse && order.status === 'Pending' && (
                          <button 
                            onClick={() => openProcessing(order)}
                            className="p-3 bg-primary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
                            title="Acknowledge & Process"
                          >
                            <PackageCheck className="w-4 h-4" />
                          </button>
                        )}
                        {!isWarehouse && order.status === 'In-Transit' && (
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
                            onClick={() => {
                              setCancellingOrder(order);
                              setCancellationReason('');
                            }}
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
              {paginatedOrders.length === 0 && (
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

        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="px-10 py-6 bg-background/50 border-t border-ink/5 flex items-center justify-between no-print">
            <div className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">
              Showing <span className="text-ink">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-ink">{Math.min(currentPage * itemsPerPage, sortedOrders.length)}</span> of <span className="text-ink">{sortedOrders.length}</span> entries
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white border border-ink/5 rounded-lg text-ink disabled:opacity-20 transition-all hover:bg-ink hover:text-white"
              >
                <ArrowUpDown className="w-4 h-4 rotate-180" />
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
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Processing Modal */}
      {processingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProcessingOrder(null)}
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
                  <h3 className="text-4xl font-serif font-medium text-ink italic">Acknowledge & Process</h3>
                  <p className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest mt-1">Adjusting supply magnitudes for #{String(processingOrder.id).slice(0, 8)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={addItemToProcessing}
                    className="p-3 bg-primary/10 text-primary rounded-full hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center gap-2 pr-5"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest">Add Item</span>
                  </button>
                  <button onClick={() => setProcessingOrder(null)} className="p-3 bg-background hover:bg-ink hover:text-white rounded-full transition-all active:scale-90">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="max-h-[40vh] overflow-y-auto pr-4 custom-scrollbar space-y-4">
                {processingItems.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={idx} className="p-6 bg-background rounded-2xl border border-ink/5 flex items-center justify-between gap-6 relative">
                      <div className="min-w-0 flex-1">
                        {item.isNew ? (
                          <div className="space-y-2">
                             <p className="text-[10px] font-mono font-black uppercase tracking-widest text-primary mb-1">New Allocation</p>
                             <select 
                               value={item.productId}
                               onChange={(e) => updateProcessingItemProduct(idx, e.target.value)}
                               className="w-full bg-white border border-ink/5 px-4 py-2 rounded-xl text-xs font-serif italic focus:outline-none focus:ring-2 focus:ring-primary/20"
                             >
                               {products.map(p => (
                                 <option key={p.id} value={p.id}>{p.name}</option>
                               ))}
                             </select>
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] font-mono font-black uppercase tracking-widest text-primary mb-1">{product?.id}</p>
                            <h4 className="text-lg font-serif font-medium text-ink truncate italic">{product?.name}</h4>
                            <p className="text-[10px] font-mono font-bold text-ink/40 mt-1 uppercase tracking-tighter">Requested Quantity: {item.quantity}</p>
                          </>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-ink/5 shadow-sm">
                        <label className="text-[9px] font-mono font-black uppercase tracking-widest text-ink/30 px-3">Supplied</label>
                        <input 
                          type="number"
                          value={isNaN(item.suppliedQuantity) ? '' : item.suppliedQuantity}
                          onChange={(e) => updateItemSupply(idx, e.target.value)}
                          className="w-24 px-4 py-3 bg-background border-none rounded-lg text-xs font-mono font-bold text-ink focus:ring-2 focus:ring-primary/20 text-center"
                          min="0"
                        />
                        <button 
                          onClick={() => removeItemFromProcessing(idx)}
                          className="p-2 text-danger hover:bg-danger/5 rounded-lg transition-all"
                          title="Remove from shipment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
                  onClick={() => setProcessingOrder(null)}
                  className="flex-1 py-5 bg-background text-ink/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-ink hover:text-white transition-all active:scale-95"
                >
                  Suspend protocol
                </button>
                <button 
                  onClick={handleProcessSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-5 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:translate-y-[-1px] hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? <ArrowUpDown className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                  {isSubmitting ? 'Processing...' : 'Acknowledge & Ship'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCancellingOrder(null)}
            className="absolute inset-0 bg-ink/60 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-ink/5"
          >
            <div className="p-10 space-y-8 text-center">
              <div className="w-20 h-20 bg-danger/10 text-danger rounded-3xl flex items-center justify-center mx-auto">
                <Trash2 className="w-10 h-10" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-3xl font-serif font-medium text-ink italic">Abort Protocol?</h3>
                <p className="text-[10px] font-mono text-ink/40 font-bold uppercase tracking-widest px-4">
                  Confirming cancellation for order #{String(cancellingOrder.id).slice(0, 8)}. This action is logged.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30 text-left block ml-4">Reason for cancellation</label>
                <textarea 
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="e.g., Inventory mismatch, double order..."
                  className="w-full px-6 py-4 bg-background border border-ink/5 rounded-2xl text-xs font-medium focus:ring-4 focus:ring-danger/5 transition-all outline-none resize-none h-24"
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setCancellingOrder(null)}
                  className="flex-1 py-5 bg-background text-ink/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-ink hover:text-white transition-all active:scale-95"
                >
                  Keep active
                </button>
                <button 
                  onClick={handleCancelSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-5 bg-danger text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-danger/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? <ArrowUpDown className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  Confirm Cancel
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
                <div className="relative">
                  <select 
                    required
                    value={newOrderBranch}
                    onChange={(e) => setNewOrderBranch(e.target.value)}
                    className="w-full pl-12 pr-8 py-5 bg-background border border-ink/5 rounded-2xl text-xs font-mono font-black uppercase tracking-widest focus:ring-4 focus:ring-primary/5 transition-all outline-none appearance-none"
                  >
                    <option value="">SELECT DESTINATION</option>
                    {branches
                      .filter(b => !isLimitedRole || b.id === profile?.branch_id)
                      .map(b => (
                        <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                      ))
                    }
                  </select>
                  <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
                </div>
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
                          value={isNaN(item.quantity) ? '' : item.quantity}
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

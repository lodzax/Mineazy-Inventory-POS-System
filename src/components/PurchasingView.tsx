import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  FileText, 
  Truck, 
  CheckCircle2, 
  Package, 
  Calendar,
  Building2,
  Receipt,
  Calculator,
  User,
  AlertCircle,
  CircleGauge,
  Search,
  Filter,
  XCircle,
  Download,
  Eye,
  X as XIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PurchasingViewProps {
  supplyOrders: any[];
  branches: any[];
  products: any[];
  createSupplyOrder: (order: any) => Promise<any>;
  updateSupplyOrderStatus: (id: string | number, status: string) => Promise<void>;
  confirmSupplyReceipt: (id: string | number) => Promise<void>;
  profile: any;
}

export default function PurchasingView({ 
  supplyOrders, 
  branches, 
  products, 
  createSupplyOrder, 
  updateSupplyOrderStatus, 
  confirmSupplyReceipt,
  profile
}: PurchasingViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any | null>(null);
  
  // Filter State
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  // Create Order Form State
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [destinationBranch, setDestinationBranch] = useState('');
  const [dateOfSupply, setDateOfSupply] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<any[]>([{ productId: '', description: '', quantity: 1, unitCost: 0, vat: 15 }]);

  const filteredOrders = supplyOrders.filter(order => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (supplierFilter && !order.supplier_name.toLowerCase().includes(supplierFilter.toLowerCase())) return false;
    if (invoiceFilter && !order.invoice_number?.toLowerCase().includes(invoiceFilter.toLowerCase())) return false;
    if (destinationFilter !== 'all' && order.destination_branch_id !== destinationFilter) return false;
    if (dateFilter && !order.date_of_supply.startsWith(dateFilter)) return false;
    return true;
  });

  const generatePDF = (order: any) => {
    const doc = new jsPDF();
    const branchName = branches.find(b => b.id === order.destination_branch_id)?.name || order.destination_branch_id;
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(20, 20, 20);
    doc.text('SUPPLY ORDER MANIFEST', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Order ID: #${String(order.id).slice(-12)}`, 105, 28, { align: 'center' });
    
    // Business Info
    doc.setDrawColor(230, 230, 230);
    doc.line(20, 35, 190, 35);
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Supplier Detail:', 20, 45);
    doc.setFont('helvetica', 'bold');
    doc.text(order.supplier_name, 20, 50);
    doc.setFont('helvetica', 'normal');
    if (order.invoice_number) doc.text(`Invoice: ${order.invoice_number}`, 20, 55);
    
    doc.text('Receiving Node:', 120, 45);
    doc.setFont('helvetica', 'bold');
    doc.text(branchName, 120, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Supply Date: ${new Date(order.date_of_supply).toLocaleDateString()}`, 120, 55);
    doc.text(`Status: ${order.status}`, 120, 60);

    // Table
    const tableRows = order.items.map((item: any) => [
      item.description,
      item.quantity,
      `$${Number(item.unitCost).toFixed(2)}`,
      `${item.vat}%`,
      `$${Number(item.total).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 70,
      head: [['Description', 'Qty', 'Unit Cost', 'VAT', 'Total']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 20, right: 20 }
    });

    // Summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Amount: $${order.total_amount.toFixed(2)}`, 190, finalY, { align: 'right' });
    
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 280);
    
    doc.save(`SupplyOrder_${String(order.id).slice(-6)}.pdf`);
  };

  const addItem = () => {
    setItems([...items, { productId: '', description: '', quantity: 1, unitCost: 0, vat: 15 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, updates: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    setItems(newItems);
  };

  const calculateSubtotal = (item: any) => {
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.unitCost) || 0;
    return qty * cost;
  };

  const calculateVAT = (item: any) => {
    const vatRate = Number(item.vat) || 0;
    return calculateSubtotal(item) * (vatRate / 100);
  };

  const calculateTotal = (item: any) => {
    return calculateSubtotal(item) + calculateVAT(item);
  };

  const orderTotal = items.reduce((sum, item) => sum + calculateTotal(item), 0);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName || !destinationBranch || items.length === 0) return;

    setLoading(true);
    try {
      const processedItems = items.map(item => ({
        ...item,
        subtotal: calculateSubtotal(item),
        vatAmount: calculateVAT(item),
        total: calculateTotal(item)
      }));

      await createSupplyOrder({
        supplier_name: supplierName,
        invoice_number: invoiceNumber,
        destination_branch_id: destinationBranch,
        date_of_supply: new Date(dateOfSupply).toISOString(),
        items: processedItems,
        total_amount: orderTotal
      });

      setShowCreateModal(false);
      setSupplierName('');
      setInvoiceNumber('');
      setDestinationBranch('');
      setItems([{ productId: '', description: '', quantity: 1, unitCost: 0, vat: 15 }]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Created': return 'bg-blue-500/10 text-blue-600 border-blue-200';
      case 'In-Transit': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'Received': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'Cancelled': return 'bg-danger/10 text-danger border-danger/20';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-3xl font-serif text-ink">Supply Orders</h3>
          <p className="text-[10px] font-mono text-ink/40 uppercase tracking-widest font-bold">Manage procurement and supplier deliveries</p>
        </div>
        
        {profile?.role === 'Purchasing' || profile?.role === 'Administrator' || profile?.role === 'Manager' ? (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-4 bg-ink text-white rounded-2xl text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl"
          >
            <Plus className="w-4 h-4" />
            Create Supply Order
          </button>
        ) : null}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-8 rounded-[2rem] border border-ink/5 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-ink/5 pb-4">
          <Filter className="w-4 h-4 text-primary" />
          <h4 className="text-[10px] font-mono font-black uppercase text-ink/40 tracking-widest">Contextual Filtering</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="space-y-1.5">
            <label className="text-[9px] font-mono uppercase text-ink/30 font-black ml-1">Order Status</label>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-xs appearance-none cursor-pointer"
            >
              <option value="all">Every State</option>
              <option value="Created">Created</option>
              <option value="In-Transit">In-Transit</option>
              <option value="Received">Received</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-mono uppercase text-ink/30 font-black ml-1">Supplier Archive</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/20" />
              <input 
                type="text"
                placeholder="Search Vendors..."
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-mono uppercase text-ink/30 font-black ml-1">Invoice ID</label>
            <div className="relative">
              <Receipt className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/20" />
              <input 
                type="text"
                placeholder="Lookup Manifest..."
                value={invoiceFilter}
                onChange={(e) => setInvoiceFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-mono uppercase text-ink/30 font-black ml-1">Destination Node</label>
            <select 
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
              className="w-full p-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-xs appearance-none cursor-pointer"
            >
              <option value="all">Universal Grid</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-mono uppercase text-ink/30 font-black ml-1">Supply Timeline</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/20" />
              <input 
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full pl-11 pr-4 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs cursor-pointer"
              />
              {dateFilter && (
                <button 
                  onClick={() => setDateFilter('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/20 hover:text-primary transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {(statusFilter !== 'all' || supplierFilter || invoiceFilter || destinationFilter !== 'all' || dateFilter) && (
          <div className="flex justify-end">
            <button 
              onClick={() => {
                setStatusFilter('all');
                setSupplierFilter('');
                setInvoiceFilter('');
                setDestinationFilter('all');
                setDateFilter('');
              }}
              className="px-4 py-2 text-[8px] font-mono font-black uppercase text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-all flex items-center gap-2"
            >
              <XCircle className="w-3 h-3" />
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-6">
        {filteredOrders.length === 0 ? (
          <div className="bg-white p-16 rounded-[2.5rem] border border-ink/5 text-center">
            <Package className="w-12 h-12 text-ink/10 mx-auto mb-4" />
            <p className="text-ink/40 font-mono text-xs uppercase tracking-widest">No matching supply orders found</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <motion.div 
              layout
              key={order.id}
              className="bg-white rounded-[2rem] border border-ink/5 p-8 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col lg:flex-row justify-between gap-8">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-ink/20 italic">Order #{String(order.id).slice(-6)}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="space-y-1">
                      <p className="text-[8px] font-mono uppercase text-ink/40 font-black tracking-widest">Supplier</p>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        <span className="font-bold text-ink">{order.supplier_name}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-mono uppercase text-ink/40 font-black tracking-widest">Invoice</p>
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-primary" />
                        <span className="font-mono text-ink font-bold">{order.invoice_number || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-mono uppercase text-ink/40 font-black tracking-widest">Destination</p>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        <span className="font-bold text-ink">{branches.find(b => b.id === order.destination_branch_id)?.name || order.destination_branch_id}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-mono uppercase text-ink/40 font-black tracking-widest">Supply Date</p>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-bold text-ink">{new Date(order.date_of_supply).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-ink/[0.02] rounded-2xl p-4 overflow-x-auto">
                    <table className="w-full text-[10px] font-mono">
                      <thead>
                        <tr className="text-left opacity-40 uppercase">
                          <th className="pb-3 px-2">Description</th>
                          <th className="pb-3 px-2">Qty</th>
                          <th className="pb-3 px-2">Unit Cost</th>
                          <th className="pb-3 px-2">VAT</th>
                          <th className="pb-3 px-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/5">
                        {order.items.map((item: any, i: number) => (
                          <tr key={i}>
                            <td className="py-3 px-2">
                              <p className="font-bold">{item.description}</p>
                              {item.productId && <p className="text-[8px] opacity-40">{item.productId}</p>}
                            </td>
                            <td className="py-3 px-2 font-black">{item.quantity}</td>
                            <td className="py-3 px-2 text-ink/40">${Number(item.unitCost).toFixed(2)}</td>
                            <td className="py-3 px-2 text-ink/40">{item.vat}%</td>
                            <td className="py-3 px-2 text-right font-black">${Number(item.total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:w-64 lg:border-l lg:border-ink/5 lg:pl-8 flex flex-col justify-between items-end gap-6 text-right">
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono uppercase text-ink/40 font-black tracking-widest">Total Valuation</p>
                    <p className="text-4xl font-serif text-ink">${order.total_amount?.toFixed(2)}</p>
                  </div>

                  <div className="flex flex-wrap lg:flex-nowrap gap-3 w-full justify-end">
                    <button 
                      onClick={() => setSelectedOrderDetail(order)}
                      className="p-3 bg-ink/5 text-ink hover:bg-ink hover:text-white rounded-xl transition-all"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    
                    <button 
                      onClick={() => generatePDF(order)}
                      className="p-3 bg-primary/5 text-primary hover:bg-primary hover:text-white rounded-xl transition-all"
                      title="Export PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {order.status === 'Created' && (profile?.role === 'Purchasing' || profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                      <button 
                        onClick={() => updateSupplyOrderStatus(order.id, 'In-Transit')}
                        className="px-6 py-3 bg-amber-500 text-white rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-amber-600 transition-all flex items-center justify-center gap-2"
                      >
                        <Truck className="w-4 h-4" />
                        In-Transit
                      </button>
                    )}

                    {order.status === 'In-Transit' && (profile?.role === 'Warehouse' || profile?.role === 'Supervisor' || profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                      <button 
                        onClick={() => {
                          if (confirm("Confirm receipt of all products? This will update warehouse inventory automatically.")) {
                            confirmSupplyReceipt(order.id);
                          }
                        }}
                        className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Received
                      </button>
                    )}

                    {order.status === 'Created' && (
                      <button 
                        onClick={() => updateSupplyOrderStatus(order.id, 'Cancelled')}
                        className="px-6 py-3 border-2 border-danger/20 text-danger hover:bg-danger/5 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {order.status === 'Received' && (
                    <div className="space-y-1 w-full">
                      <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase py-2 bg-emerald-50 rounded-lg text-center flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Inventory Updated
                      </p>
                      <p className="text-[8px] font-mono text-ink/30 italic">Received on {new Date(order.received_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {selectedOrderDetail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/20"
            >
              <div className="p-8 border-b border-ink/5 bg-ink text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32 rounded-full" />
                <div className="relative z-10">
                  <h3 className="text-2xl font-serif">Order Manifest</h3>
                  <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest font-black">#{String(selectedOrderDetail.id).slice(-12)}</p>
                </div>
                <button onClick={() => setSelectedOrderDetail(null)} className="relative z-10 p-2 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 bg-background/50 space-y-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                  <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-sm space-y-1">
                    <p className="text-[8px] font-mono uppercase text-ink/30 font-black tracking-[0.2em]">Supplier</p>
                    <p className="font-serif text-xl">{selectedOrderDetail.supplier_name}</p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-sm space-y-1">
                    <p className="text-[8px] font-mono uppercase text-ink/30 font-black tracking-[0.2em]">Invoice ID</p>
                    <p className="font-mono text-lg">{selectedOrderDetail.invoice_number || 'N/A'}</p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-sm space-y-1">
                    <p className="text-[8px] font-mono uppercase text-ink/30 font-black tracking-[0.2em]">Destination</p>
                    <p className="font-bold">{branches.find(b => b.id === selectedOrderDetail.destination_branch_id)?.name || selectedOrderDetail.destination_branch_id}</p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-sm space-y-1">
                    <p className="text-[8px] font-mono uppercase text-ink/30 font-black tracking-[0.2em]">Supply Date</p>
                    <p className="font-bold">{new Date(selectedOrderDetail.date_of_supply).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-sm">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="bg-ink text-white uppercase tracking-widest">
                        <th className="py-4 px-6 text-left">Description</th>
                        <th className="py-4 px-6 text-center">Qty</th>
                        <th className="py-4 px-6 text-center">Unit Cost</th>
                        <th className="py-4 px-6 text-center">VAT</th>
                        <th className="py-4 px-6 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {selectedOrderDetail.items.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-primary/5 transition-colors">
                          <td className="py-4 px-6">
                            <p className="font-bold">{item.description}</p>
                            {item.productId && <p className="text-[9px] opacity-40">{item.productId}</p>}
                          </td>
                          <td className="py-4 px-6 text-center font-black">{item.quantity}</td>
                          <td className="py-4 px-6 text-center text-ink/40">${Number(item.unitCost).toFixed(2)}</td>
                          <td className="py-4 px-6 text-center text-ink/40">{item.vat}%</td>
                          <td className="py-4 px-6 text-right font-black font-serif text-lg">${Number(item.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-10 items-center">
                  <div className="text-right space-y-2">
                    <p className="text-[10px] font-mono uppercase text-ink/30 font-black tracking-[0.2em]">Final Valuation</p>
                    <p className="text-5xl font-serif text-ink">${selectedOrderDetail.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-ink border-t border-white/5 flex justify-end gap-4">
                <button 
                  onClick={() => generatePDF(selectedOrderDetail)}
                  className="px-8 py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl shadow-primary/20"
                >
                  <Download className="w-4 h-4" />
                  Request PDF Artifact
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showCreateModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-md p-4 overflow-y-auto pt-20 pb-20"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[3rem] w-full max-w-[1400px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/20"
            >
              <div className="p-8 border-b border-ink/5 bg-ink text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32 rounded-full" />
                <div className="relative z-10">
                  <h3 className="text-3xl font-serif">Create Supply Order</h3>
                  <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest font-black">Procurement Manifest Generation</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="relative z-10 p-2 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-6 h-6" /></button>
              </div>

              <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto bg-background/50 custom-scrollbar">
                <div className="p-10 space-y-12">
                  {/* Header Info Section - Grouped in a Card */}
                  <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-ink/5">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="text-lg font-serif text-ink">General Information</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-mono uppercase text-ink/40 font-black ml-1">Supplier Name</label>
                        <div className="relative group">
                          <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/20 group-focus-within:text-primary transition-colors" />
                        <select 
                          required
                          value={supplierName}
                          onChange={(e) => setSupplierName(e.target.value)}
                          className="w-full pl-11 pr-4 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold appearance-none cursor-pointer"
                        >
                          <option value="">Select Supplier</option>
                          <option value="Vendors Paradise">Vendors Paradise</option>
                          <option value="Midlands Beaters">Midlands Beaters</option>
                          <option value="Parts Investments">Parts Investments</option>
                          <option value="Zhezhiang Mining Well">Zhezhiang Mining Well</option>
                        </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-mono uppercase text-ink/40 font-black ml-1">Invoice Number</label>
                        <div className="relative group">
                          <Receipt className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/20 group-focus-within:text-primary transition-colors" />
                          <input 
                            type="text"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            className="w-full pl-11 pr-4 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono placeholder:font-sans placeholder:text-ink/20"
                            placeholder="Optional Manifest ID"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-mono uppercase text-ink/40 font-black ml-1">Destination Branch / Warehouse</label>
                        <div className="relative group">
                          <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/20 group-focus-within:text-primary transition-colors" />
                          <select 
                            required
                            value={destinationBranch}
                            onChange={(e) => setDestinationBranch(e.target.value)}
                            className="w-full pl-11 pr-4 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold appearance-none cursor-pointer"
                          >
                            <option value="">Select Receiving Node</option>
                            {branches.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-mono uppercase text-ink/40 font-black ml-1">Date of Supply</label>
                        <div className="relative group">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/20 group-focus-within:text-primary transition-colors" />
                          <input 
                            required
                            type="date"
                            value={dateOfSupply}
                            onChange={(e) => setDateOfSupply(e.target.value)}
                            className="w-full pl-11 pr-4 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Items Section - Grouped in a Card */}
                  <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-ink/5">
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-lg font-serif text-ink">Product Manifest</h4>
                          <p className="text-[8px] font-mono text-ink/30 uppercase tracking-[0.2em]">Detailed line-item specification</p>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={addItem}
                        className="px-5 py-3 bg-ink text-white hover:bg-primary text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-ink/10"
                      >
                        <Plus className="w-4 h-4" />
                        Add New Product
                      </button>
                    </div>

                    <div className="space-y-4">
                      {items.map((item, index) => (
                        <motion.div 
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          key={index} 
                          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end bg-background/30 p-8 rounded-[2rem] border border-ink/5 hover:border-primary/20 hover:bg-white transition-all group relative animate-in fade-in slide-in-from-left-2"
                        >
                          <div className="lg:col-span-2 space-y-2">
                            <label className="text-[8px] font-mono uppercase text-ink/40 font-black ml-1">Product</label>
                            <select 
                              value={item.productId}
                              onChange={(e) => {
                                const p = products.find(prod => prod.id === e.target.value);
                                updateItem(index, { 
                                  productId: e.target.value, 
                                  description: p ? p.name : item.description,
                                  unitCost: p ? p.cost_price || 0 : item.unitCost
                                });
                              }}
                              className="w-full p-4 bg-white border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-xs"
                            >
                              <option value="">Manual / Other</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="lg:col-span-2 space-y-2">
                            <label className="text-[8px] font-mono uppercase text-ink/40 font-black ml-1 text-center block">Description</label>
                            <input 
                              required
                              type="text"
                              value={item.description}
                              onChange={(e) => updateItem(index, { description: e.target.value })}
                              className="w-full p-4 bg-white border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-xs placeholder:text-ink/10"
                              placeholder="Describe product..."
                            />
                          </div>

                          <div className="lg:col-span-2 space-y-2">
                            <label className="text-[8px] font-mono uppercase text-ink/40 font-black ml-1 text-center block">Quantity</label>
                            <input 
                              required
                              type="number"
                              min="1"
                              value={isNaN(item.quantity) ? '' : item.quantity}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                updateItem(index, { quantity: isNaN(val) ? 0 : val });
                              }}
                              className="w-full p-4 bg-white border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-black text-center text-sm"
                            />
                          </div>

                          <div className="lg:col-span-2 space-y-2">
                            <label className="text-[8px] font-mono uppercase text-ink/40 font-black ml-1 text-center block">Unit Cost</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30 text-[10px] font-mono">$</span>
                              <input 
                                required
                                type="number"
                                step="0.01"
                                value={isNaN(item.unitCost) ? '' : item.unitCost}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                  updateItem(index, { unitCost: isNaN(val) ? 0 : val });
                                }}
                                className="w-full pl-8 pr-4 py-4 bg-white border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-black text-xs"
                              />
                            </div>
                          </div>

                          <div className="lg:col-span-2 space-y-2">
                            <label className="text-[8px] font-mono uppercase text-ink/40 font-black ml-1 text-center block">VAT %</label>
                            <input 
                              required
                              type="number"
                              value={isNaN(item.vat) ? '' : item.vat}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                updateItem(index, { vat: isNaN(val) ? 0 : val });
                              }}
                              className="w-full p-4 bg-white border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-black text-center text-sm"
                            />
                          </div>

                          <div className="lg:col-span-1 space-y-2 text-right">
                            <p className="text-[8px] font-mono uppercase text-ink/40 font-black tracking-widest px-2">Total</p>
                            <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
                              <p className="text-xs font-black text-primary font-mono">${calculateTotal(item).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>

                          <div className="lg:col-span-1 flex justify-center lg:pb-3">
                            <button 
                              type="button" 
                              onClick={() => removeItem(index)}
                              disabled={items.length === 1}
                              className="p-3 text-ink/20 hover:text-danger hover:bg-danger/10 rounded-xl transition-all disabled:opacity-0 active:scale-90"
                              title="Delete line item"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Summary Footer - Elevated with sticky behavior maybe */}
                <div className="sticky bottom-0 p-10 bg-gradient-to-t from-background via-background/80 to-transparent">
                  <div className="flex flex-col lg:flex-row justify-between items-center bg-ink p-10 rounded-[3rem] text-white gap-8 border-t-4 border-primary shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-primary/5 pointer-events-none" />
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center lg:text-left relative z-10">
                      <div className="space-y-1">
                        <p className="text-[9px] font-mono uppercase text-white/40 tracking-[0.2em] font-black">Net Amount</p>
                        <p className="text-2xl font-serif text-white/90">${items.reduce((sum, item) => sum + calculateSubtotal(item), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-mono uppercase text-white/40 tracking-[0.2em] font-black">VAT Amount</p>
                        <p className="text-2xl font-serif text-white/90">${items.reduce((sum, item) => sum + calculateVAT(item), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-mono uppercase text-white/40 tracking-[0.2em] font-black">Line Items</p>
                        <p className="text-2xl font-serif text-white/90">{items.length}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-mono uppercase text-white/40 tracking-[0.2em] font-black">Currency</p>
                        <p className="text-2xl font-serif text-white/90">USD</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-10 relative z-10 w-full lg:w-auto">
                      <div className="text-center lg:text-right flex-1 lg:flex-none">
                        <p className="text-[10px] font-mono uppercase text-primary tracking-[0.3em] font-black italic">Final Manifest Value</p>
                        <p className="text-6xl font-serif text-white leading-tight drop-shadow-lg">${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <button 
                        type="submit" 
                        disabled={loading || !destinationBranch || !supplierName}
                        className="px-12 py-6 bg-primary text-white rounded-3xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.03] active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 flex items-center gap-4 group"
                      >
                        {loading ? (
                          <CircleGauge className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            Finalize Order
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed = false }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, collapsed?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 w-full py-3 transition-all group rounded-xl ${active ? 'bg-primary text-white scale-[1.02] shadow-lg shadow-primary/20' : 'text-white/60 hover:text-white hover:bg-white/5'} ${collapsed ? 'justify-center' : 'px-4'}`}
    >
      <div className={`${active ? 'text-white' : 'text-primary'}`}>{icon}</div>
      {!collapsed && <span className="font-bold text-xs uppercase tracking-widest">{label}</span>}
      {collapsed && (
        <div className="absolute left-full ml-4 px-3 py-1 bg-ink text-white text-[10px] uppercase font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          {label}
        </div>
      )}
    </button>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  );
}

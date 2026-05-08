import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  Search, 
  CheckCircle2, 
  FileText,
  DollarSign,
  Package,
  Store,
  Printer,
  ArrowRight,
  CircleGauge,
  X,
  Download
} from 'lucide-react';
import POSReceipt from './POSReceipt';

interface POSViewProps {
  products: any[];
  branches: any[];
  inventory: any[];
  processSale: (branchId: string, items: any[], total: number, customerName: string, cashierName: string) => Promise<any>;
  user: any;
  profile: any;
}

export default function POSView({ products, branches, inventory, processSale, user, profile }: POSViewProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [search, setSearch] = useState('');
  
  // Sync selected branch when profile or branches load
  React.useEffect(() => {
    if (profile?.branch_id) {
      setSelectedBranch(profile.branch_id.toLowerCase());
    } else if (branches.length > 0 && !selectedBranch) {
      // For non-limited roles or if profile lacks branch_id, default to first branch
      setSelectedBranch(branches[0].id);
    }
  }, [profile, branches, selectedBranch]);

  const [cart, setCart] = useState<{ productId: string, quantity: number, price: number }[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSaleReceipt, setLastSaleReceipt] = useState<any | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);

  const branchInventory = useMemo(() => {
    return inventory.filter(i => i.branch_id === selectedBranch);
  }, [inventory, selectedBranch]);

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.productId === product.id);
    const stock = branchInventory.find(i => i.product_id === product.id)?.stock || 0;
    
    if (existing) {
      if (existing.quantity >= stock) return; // Cap at stock
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      if (stock <= 0) return;
      setCart([...cart, { productId: product.id, quantity: 1, price: product.price || 0 }]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    const stock = branchInventory.find(i => i.product_id === productId)?.stock || 0;
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(1, Math.min(stock, item.quantity + delta));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const generatePDF = () => {
    if (!lastSaleReceipt) return;
    const doc = new jsPDF();

    const branch = branches.find(b => b.id === lastSaleReceipt.branch_id)?.name || 'Unknown Branch';
    const cashier = user?.displayName || user?.email || 'System User';
    const dateStr = lastSaleReceipt.timestamp.toLocaleString();

    // Corporate style header (Modernized)
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // #0F172A (ink color)
    doc.setFont("helvetica", "bold");
    doc.text(`${branch.toUpperCase()} RECEIPT`, 105, 20, { align: "center" });
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.text(`TRANSACTION ID: #${lastSaleReceipt.id.toString()}`, 105, 28, { align: "center" });

    // Transaction Details
    doc.setDrawColor(241, 245, 249);
    doc.line(20, 35, 190, 35);
    
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.text(`BRANCH NODE:`, 20, 45);
    doc.setFont("helvetica", "bold");
    doc.text(branch, 55, 45);

    doc.setFont("helvetica", "normal");
    doc.text(`TIMESTAMP:`, 20, 52);
    doc.setFont("helvetica", "bold");
    doc.text(dateStr, 55, 52);

    doc.setFont("helvetica", "normal");
    doc.text(`CASHIER:`, 145, 45, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(cashier, 190, 45, { align: "right" });

    if (lastSaleReceipt.customer_name) {
      doc.setFont("helvetica", "normal");
      doc.text(`CUSTOMER:`, 145, 52, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(lastSaleReceipt.customer_name, 190, 52, { align: "right" });
    }

    // Items Table
    const tableData = lastSaleReceipt.items.map((item: any) => {
      const p = products.find((prod: any) => prod.id === item.productId);
      return [
        p?.name || item.productId,
        `${item.quantity} ${p?.unit || ''}`,
        `$${item.price.toFixed(2)}`,
        `$${(item.quantity * item.price).toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [['PRODUCT RESOURCE', 'QTY / UNIT', 'BASE PRICE', 'MAGNITUDE']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 5 },
      columnStyles: { 3: { halign: 'right' } }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;

    // Totals
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`TOTAL MAGNITUDE: $${lastSaleReceipt.total.toFixed(2)}`, 190, finalY, { align: "right" });

    // Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("END OF STREAM. ALL TRANSACTIONS AUDITED AND LOGGED.", 105, finalY + 25, { align: "center" });

    doc.save(`Receipt_${lastSaleReceipt.id.toString()}.pdf`);
  };

  const handlePrint = () => {
    window.focus();
    document.body.classList.add('printing-receipt');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-receipt');
    }, 50);
  };

  const handleCheckout = async () => {
    if (!selectedBranch || cart.length === 0) return;
    setIsProcessing(true);
    const cashierName = user?.displayName || user?.email || 'System User';
    try {
      const sale = await processSale(selectedBranch, cart, total, customerName, cashierName);
      if (sale) {
        setLastSaleReceipt({
          ...sale,
          timestamp: new Date(sale.timestamp)
        });
      }
      setCart([]);
      setCustomerName('');
      setIsCartOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative pb-12">
      {/* Product Selection Area - Expanded to full width */}
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row gap-5 justify-between items-start md:items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            <input 
              type="text"
              placeholder="Search resource matrix..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-14 pr-6 py-5 bg-white border border-ink/5 rounded-[2rem] shadow-xl shadow-ink/[0.01] focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all font-medium"
            />
          </div>
          <div className="flex items-center gap-4 bg-white px-8 py-4 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.01]">
            <div className="w-10 h-10 bg-primary/5 rounded-2xl flex items-center justify-center text-primary">
              <Store className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-ink/40 uppercase font-black tracking-widest leading-none mb-1.5">Active Node</span>
              <div className="relative">
                <select 
                  value={selectedBranch}
                  disabled={!!profile?.branch_id && (profile?.role === 'Supervisor' || profile?.role === 'Cashier')}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setCart([]); // Clear cart when branch changes to avoid stock issues
                  }}
                  className="bg-transparent focus:outline-none font-black text-xs uppercase tracking-widest text-ink appearance-none cursor-pointer pr-6 disabled:cursor-not-allowed leading-none"
                >
                  {branches.length > 0 ? (
                    branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))
                  ) : (
                    <option value="">No Branches Available</option>
                  )}
                </select>
                {(!(profile?.branch_id && (profile?.role === 'Supervisor' || profile?.role === 'Cashier'))) && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-ink/30 rotate-45" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-6">
          {filteredProducts.map(product => {
            const stock = branchInventory.find(i => i.product_id === product.id)?.stock || 0;
            const inCart = cart.find(item => item.productId === product.id)?.quantity || 0;
            const availableStock = stock - inCart;
            const isLowStock = availableStock <= 5 && availableStock > 0;
            const isOutOfStock = availableStock <= 0;

            return (
              <motion.button
                key={product.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -6, shadow: "0 25px 50px -12px rgba(0, 0, 0, 0.05)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addToCart(product)}
                disabled={isOutOfStock}
                className={`p-7 rounded-[2.5rem] text-left transition-all relative flex flex-col h-full bg-white border border-ink/[0.03] shadow-xl shadow-ink/[0.01] group overflow-hidden ${
                  isOutOfStock ? 'opacity-40 grayscale' : ''
                }`}
              >
                <div className="w-14 h-14 bg-background rounded-2xl flex items-center justify-center mb-6 text-ink/20 group-hover:text-primary transition-colors">
                  <Package className="w-8 h-8" />
                </div>
                
                <h4 className="font-serif text-2xl font-medium text-ink mb-1 italic leading-tight">{product.name}</h4>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-[9px] font-mono text-ink/30 uppercase font-black tracking-widest">Base Asset</span>
                  <div className="w-1 h-1 rounded-full bg-ink/10" />
                  <span className="text-[9px] font-mono text-primary uppercase font-black tracking-widest">{product.unit}</span>
                </div>
                
                <div className="mt-auto flex justify-between items-end pt-4 border-t border-ink/[0.03]">
                  <div className="flex flex-col">
                    <span className="text-ink font-mono font-black text-2xl tracking-tighter">${product.price || 0}</span>
                    <span className="text-[8px] font-mono text-ink/40 uppercase font-bold tracking-widest">Unit Price</span>
                  </div>
                  
                  <div className={`flex flex-col items-end ${isLowStock ? 'text-warning' : isOutOfStock ? 'text-danger' : 'text-accent'}`}>
                    <span className="font-mono text-lg font-black tracking-tighter">{availableStock}</span>
                    <span className="text-[8px] font-mono uppercase font-black tracking-widest">Stocks</span>
                  </div>
                </div>

                {inCart > 0 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-6 right-6 w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center text-sm font-black shadow-lg shadow-primary/20 rotate-12"
                  >
                    {inCart}
                  </motion.div>
                )}

                {isOutOfStock && (
                  <div className="absolute inset-0 bg-ink/5 backdrop-blur-[1px] flex items-center justify-center">
                    <span className="bg-ink text-white px-4 py-1 rounded-full text-[10px] font-mono uppercase font-black tracking-widest -rotate-45">Depleted</span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Floating View Cart Trigger */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.button
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            onClick={() => setIsCartOpen(true)}
            className="fixed bottom-10 right-10 z-[60] bg-ink text-white px-8 py-5 rounded-[2.5rem] shadow-2xl shadow-ink/40 flex items-center gap-4 hover:translate-y-[-5px] transition-all group"
          >
            <div className="relative">
              <ShoppingCart className="w-6 h-6 text-primary" />
              <div className="absolute -top-2 -right-2 w-5 h-5 bg-white text-ink rounded-full flex items-center justify-center text-[10px] font-black">
                {cart.length}
              </div>
            </div>
            <div className="text-left">
              <p className="text-[10px] font-mono font-black uppercase tracking-[0.2em] leading-none mb-1 text-primary">View Resource Feed</p>
              <p className="text-xl font-mono font-black leading-none">${total.toFixed(2)}</p>
            </div>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Cart Drawer Overlay & Sidebar */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 z-[70] bg-ink/60 backdrop-blur-sm"
            />
            
            {/* Sidebar Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-[#F8F9FA] z-[80] shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="px-8 py-6 bg-white border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Cart</h3>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Cart Item Feed */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 custom-scrollbar">
                {/* We'll use a single group for now, but style it like the screenshot */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Resources</span>
                  </div>
                  
                  <AnimatePresence mode="popLayout" initial={false}>
                    {cart.map(item => {
                      const product = products.find(p => p.id === item.productId);
                      const lineTotal = item.price * item.quantity;
                      return (
                        <motion.div 
                          key={item.productId}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100/50 shadow-sm group"
                        >
                          {/* Item Icon */}
                          <div className="w-16 h-16 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors">
                            <Package className="w-8 h-8" />
                          </div>

                          {/* Item Details */}
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-bold text-gray-800 truncate leading-tight uppercase tracking-tight">{product?.name}</h5>
                            <button 
                              onClick={() => removeFromCart(item.productId)}
                              className="text-[11px] font-medium text-gray-400 hover:text-danger mt-1 transition-colors"
                            >
                              Remove
                            </button>
                          </div>

                          {/* Quantity & Price Controller */}
                          <div className="flex items-center bg-gray-50 border border-gray-100 rounded-lg p-1 gap-2">
                            <button 
                              onClick={() => updateQuantity(item.productId, -1)}
                              className="w-6 h-6 flex items-center justify-center hover:bg-white rounded text-gray-400 hover:text-gray-800 transition-all active:scale-90"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            
                            <div className="flex items-center gap-1.5 px-1">
                              <span className="text-xs font-bold text-gray-400 leading-none">{item.quantity}</span>
                              <span className="text-[10px] text-gray-300 font-bold">x</span>
                              <div className="px-2 py-1 bg-primary text-white text-[10px] font-bold rounded shadow-sm">
                                ${item.price.toFixed(0)}
                              </div>
                            </div>

                            <button 
                              onClick={() => updateQuantity(item.productId, 1)}
                              className="w-6 h-6 flex items-center justify-center hover:bg-white rounded text-gray-400 hover:text-gray-800 transition-all active:scale-90"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                {cart.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-gray-200 py-32 space-y-4">
                    <ShoppingCart className="w-16 h-16 opacity-10" />
                    <p className="font-bold text-sm opacity-40 uppercase tracking-widest">Cart is empty</p>
                  </div>
                )}
              </div>

              {/* Checkout Footer */}
              <div className="p-8 bg-white border-t border-gray-100 space-y-6">
                <div className="flex justify-between items-center py-4 px-6 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-sm font-bold text-gray-500">Subtotal</span>
                  <span className="text-lg font-bold text-gray-800 tracking-tight">${total.toFixed(2)}</span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30 ml-4">Customer Designation</label>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="e.g. Tendai Moyo"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-background border border-ink/5 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                      />
                      <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/20" />
                    </div>
                  </div>

                  <button 
                    disabled={cart.length === 0 || isProcessing}
                    onClick={handleCheckout}
                    className="w-full py-4 bg-primary text-white rounded-xl font-bold text-sm shadow-xl shadow-primary/20 flex items-center justify-center gap-3 hover:bg-primary/95 transition-all disabled:opacity-30 disabled:shadow-none active:scale-[0.98]"
                  >
                    {isProcessing ? (
                      <CircleGauge className="w-5 h-5 animate-spin" />
                    ) : (
                      "Confirm & Checkout"
                    )}
                  </button>
                  
                  <button 
                    onClick={() => {
                      setCart([]);
                      setIsCartOpen(false);
                    }}
                    className="w-full py-2 text-gray-400 hover:text-danger text-xs font-bold transition-colors"
                  >
                    Cancel Order
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Digital Receipt Modal */}
      <AnimatePresence>
        {lastSaleReceipt && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-4 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl p-12 relative overflow-hidden"
            >
              {/* Receipt Background Texture */}
              <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-primary to-secondary" />
              
              <div className="flex flex-col items-center mb-10 text-center pt-4">
                <div className="w-24 h-24 bg-accent/10 rounded-[2.5rem] flex items-center justify-center mb-6 text-accent shadow-xl shadow-accent/10 rotate-12">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h2 className="text-4xl font-serif italic text-ink mb-1">State Synchronized</h2>
                <p className="text-[10px] font-mono text-ink/30 uppercase tracking-[0.2em] font-black">STREAM ID: #{lastSaleReceipt.id.toString()}</p>
              </div>

              <div className="space-y-6 mb-10">
                <div className="flex flex-col gap-2 px-6 py-4 bg-background rounded-2xl border border-ink/5">
                  <div className="flex justify-between items-center text-[9px] font-mono font-black uppercase tracking-widest text-ink/20">
                    <span>Cashier Artifact</span>
                    <span className="text-ink/60">{lastSaleReceipt.cashier_name || user?.displayName || user?.email || 'System User'}</span>
                  </div>
                  {lastSaleReceipt.customer_name && (
                    <div className="flex justify-between items-center text-[9px] font-mono font-black uppercase tracking-widest text-ink/20">
                      <span>Customer Identity</span>
                      <span className="text-ink/60">{lastSaleReceipt.customer_name}</span>
                    </div>
                  )}
                </div>

                <div className="border-y-2 border-ink/[0.03] border-dashed py-8 space-y-5">
                  {lastSaleReceipt.items.map((item: any, idx: number) => {
                    const product = products.find(p => p.id === item.productId);
                    return (
                      <div key={idx} className="flex justify-between items-start">
                        <div className="flex-1 pr-6">
                          <p className="text-ink font-bold text-sm leading-tight mb-1">{product?.name}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-ink/40 font-mono font-bold">{item.quantity} {product?.unit}</span>
                            <div className="w-1 h-1 rounded-full bg-ink/10" />
                            <span className="text-[10px] text-primary font-mono font-black">@{item.price}</span>
                          </div>
                        </div>
                        <span className="font-mono text-ink font-black text-sm">${(item.quantity * item.price).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between items-end">
                   <div className="flex flex-col">
                      <span className="text-ink/30 text-[9px] font-mono font-black uppercase tracking-widest">Aggregate Paythrough</span>
                      <span className="text-ink font-serif text-2xl italic leading-none">Net Volume</span>
                   </div>
                   <span className="text-4xl font-mono font-black text-ink tracking-tighter leading-none">${lastSaleReceipt.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={handlePrint}
                    className="flex-1 py-5 bg-ink text-white border-2 border-ink/5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-primary transition-all active:scale-95 shadow-xl"
                  >
                    <Printer className="w-5 h-5 opacity-40" />
                    Print
                  </button>
                  <button 
                    onClick={generatePDF}
                    className="flex-1 py-5 bg-background border-2 border-ink/5 text-ink rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-ink hover:text-white transition-all active:scale-95 shadow-sm"
                  >
                    <Download className="w-5 h-5 opacity-40" />
                    PDF
                  </button>
                </div>
                <button 
                  onClick={() => setLastSaleReceipt(null)}
                  className="w-full py-5 bg-ink text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-4 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95"
                >
                  Begin Next Sequence
                  <ArrowRight className="w-5 h-5 text-primary" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <POSReceipt 
        sale={lastSaleReceipt}
        branch={branches.find(b => b.id === lastSaleReceipt?.branch_id)}
        cashier={user?.displayName || user?.email || 'System User'}
        products={products}
      />
    </div>
  );
}

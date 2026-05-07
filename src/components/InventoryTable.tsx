import React, { useState } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, Search, ChevronDown, ChevronUp, Edit3, QrCode, ArrowRightLeft } from 'lucide-react';
import QRCodeModal from './QRCodeModal';

interface InventoryTableProps {
  inventory: any[];
  branches: any[];
  products: any[];
  onUpdate: (branchId: string, productId: string, amount: number, type: 'add' | 'remove', notes: string) => void;
  updateProduct: (id: string, updates: { price?: number, cost_price?: number, unit?: string, name?: string }) => void;
  updateThreshold: (branchId: string, productId: string, threshold: number) => void;
  convertMercury: (branchId: string) => Promise<boolean>;
  profile: any;
}

export default function InventoryTable({ inventory, branches, products, onUpdate, updateProduct, updateThreshold, convertMercury, profile }: InventoryTableProps) {
  const isLimited = profile?.role === 'Supervisor' || profile?.role === 'Cashier';
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Sync selected branch for limited roles
  React.useEffect(() => {
    if (isLimited && profile?.branch_id) {
      setSelectedBranch(profile.branch_id.toLowerCase());
    } else if (!isLimited && !selectedBranch) {
      setSelectedBranch('all');
    } else if (isLimited && !profile?.branch_id && branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id);
    }
  }, [profile, isLimited, branches, selectedBranch]);

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockLevelFilter, setStockLevelFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [manualUpdate, setManualUpdate] = useState<{ branchId: string, productId: string, type: 'add' | 'remove' } | null>(null);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualNotes, setManualNotes] = useState<string>('');
  const [qrModal, setQrModal] = useState<{ branchId: string, productId: string } | null>(null);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', unit: '', price: '', cost_price: '' });
  const [thresholdUpdate, setThresholdUpdate] = useState<{ branchId: string, productId: string, current: number } | null>(null);
  const [thresholdAmount, setThresholdAmount] = useState<string>('');

  const filteredProducts = products.filter(p => {
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    
    // Improved search: split into terms and match all terms
    const searchTerms = search.toLowerCase().trim().split(/\s+/);
    const matchesSearch = searchTerms.every(term => 
      p.name.toLowerCase().includes(term) || 
      p.category?.toLowerCase().includes(term)
    );
    
    return matchesCategory && (search === '' || matchesSearch);
  });

  const filteredBranches = branches.filter(b => {
    const matchesBranchSelection = selectedBranch === 'all' || b.id === selectedBranch;
    
    const searchTerms = search.toLowerCase().trim().split(/\s+/);
    const branchNameMatches = searchTerms.every(term => 
      b.name.toLowerCase().includes(term) ||
      b.id.toString().toLowerCase().includes(term)
    );
    
    // If the search matches any product, and we aren't filtering purely by branch name, 
    // we show the branches (the matrix will show the matching columns)
    const productMatchesSearch = products.some(p => {
      const pName = p.name.toLowerCase();
      const pCat = p.category?.toLowerCase() || '';
      return searchTerms.every(term => pName.includes(term) || pCat.includes(term));
    });

    const matchesStock = stockLevelFilter === 'all' || filteredProducts.some(p => {
      const inv = inventory.find(i => i.branch_id === b.id && i.product_id === p.id);
      const stock = inv ? inv.stock : 0;
      const threshold = inv ? (inv.low_stock_threshold || 5) : 5;
      
      if (stockLevelFilter === 'critical') return stock === 0;
      if (stockLevelFilter === 'low') return stock > 0 && stock <= threshold;
      if (stockLevelFilter === 'in-stock') return stock > threshold;
      return true;
    });

    return matchesBranchSelection && matchesStock && (search === '' || branchNameMatches || productMatchesSearch);
  });

  const [isConverting, setIsConverting] = useState<string | null>(null);

  const handleConvert = async (branchId: string) => {
    setIsConverting(branchId);
    try {
      const success = await convertMercury(branchId);
      if (success) {
        alert("Mercury conversion completed successfully. 1kg -> 33x30g recorded.");
      }
    } finally {
      setIsConverting(null);
    }
  };

  const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualUpdate && manualAmount) {
      onUpdate(manualUpdate.branchId, manualUpdate.productId, parseFloat(manualAmount), manualUpdate.type, manualNotes);
      setManualUpdate(null);
      setManualAmount('');
      setManualNotes('');
    }
  };

  const handleEditProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name: editForm.name,
        unit: editForm.unit,
        price: parseFloat(editForm.price),
        cost_price: parseFloat(editForm.cost_price)
      });
      setEditingProduct(null);
    }
  };

  const handleThresholdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (thresholdUpdate && thresholdAmount !== '') {
      updateThreshold(thresholdUpdate.branchId, thresholdUpdate.productId, parseFloat(thresholdAmount));
      setThresholdUpdate(null);
      setThresholdAmount('');
    }
  };

  const activeQRData = qrModal ? {
    branch: branches.find(b => b.id === qrModal.branchId)!,
    product: products.find(p => p.id === qrModal.productId)!
  } : null;

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {editingProduct && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md"
          >
            <motion.form 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              onSubmit={handleEditProductSubmit}
              className="bg-white p-10 rounded-[3rem] w-full max-w-sm border border-white/10 shadow-2xl space-y-8"
            >
              <div>
                <h3 className="text-3xl font-serif font-medium text-ink">Update Product</h3>
                <p className="text-[10px] font-mono text-primary uppercase font-bold tracking-widest mt-1">Global Configuration</p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Product Name</label>
                  <input 
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Unit</label>
                  <input 
                    type="text"
                    required
                    value={editForm.unit}
                    onChange={(e) => setEditForm({...editForm, unit: e.target.value})}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Price ($)</label>
                    <input 
                      type="number"
                      required
                      step="0.01"
                      value={editForm.price}
                      onChange={(e) => setEditForm({...editForm, price: e.target.value})}
                      className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Cost ($)</label>
                    <input 
                      type="number"
                      required
                      step="0.01"
                      value={editForm.cost_price}
                      onChange={(e) => setEditForm({...editForm, cost_price: e.target.value})}
                      className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 py-4 font-bold text-[10px] text-ink uppercase tracking-widest hover:bg-background rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 font-bold text-[10px] bg-ink text-white rounded-2xl uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all"
                >
                  Save
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {manualUpdate && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md"
          >
            <motion.form 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              onSubmit={handleManualSubmit}
              className="bg-white p-10 rounded-[3rem] w-full max-w-sm border border-white/10 shadow-2xl space-y-8"
            >
              <div>
                <h3 className="text-3xl font-serif font-medium text-ink capitalize">
                   {manualUpdate.type} Stock
                </h3>
                <p className="text-[10px] font-mono text-primary uppercase font-bold tracking-widest mt-1">
                  {products.find(p => p.id === manualUpdate.productId)?.name} at {branches.find(b => b.id === manualUpdate.branchId)?.name}
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Quantity</label>
                  <input 
                    type="number"
                    required
                    autoFocus
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold text-2xl"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Internal Reference</label>
                  <textarea 
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium resize-none h-24"
                    placeholder="Reason for adjustment..."
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setManualUpdate(null)}
                  className="flex-1 py-4 font-bold text-[10px] text-ink uppercase tracking-widest hover:bg-background rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 font-bold text-[10px] bg-primary text-white rounded-2xl uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all"
                >
                   Finalize
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {qrModal && activeQRData && (
          <QRCodeModal 
            branch={activeQRData.branch}
            product={activeQRData.product}
            onClose={() => setQrModal(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {thresholdUpdate && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md"
          >
            <motion.form 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              onSubmit={handleThresholdSubmit}
              className="bg-white p-10 rounded-[3rem] w-full max-w-sm border border-white/10 shadow-2xl space-y-8"
            >
              <div>
                <h3 className="text-3xl font-serif font-medium text-ink">Alert Threshold</h3>
                <p className="text-[10px] font-mono text-primary uppercase font-bold tracking-widest mt-1">Configurable Safety Magnitude</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Low Stock Limit</label>
                <div className="relative">
                  <input 
                    type="number"
                    required
                    autoFocus
                    value={thresholdAmount}
                    onChange={(e) => setThresholdAmount(e.target.value)}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold text-2xl"
                    min="0"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono font-black text-ink/20 uppercase">Units</div>
                </div>
                <p className="text-[10px] text-ink/40 mt-3 leading-relaxed italic">
                  When inventory falls below this value at this specific node, critical UI visual indicators will activate.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setThresholdUpdate(null)}
                  className="flex-1 py-4 font-bold text-[10px] text-ink uppercase tracking-widest hover:bg-background rounded-2xl transition-all"
                >
                  Discard
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 font-bold text-[10px] bg-ink text-white rounded-2xl uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all"
                >
                   Stabilize
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row gap-5 items-center justify-between">
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
          <input 
            type="text"
            placeholder="Search products or branches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-white border border-ink/5 rounded-2xl font-sans text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-xl shadow-ink/[0.01]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
            <span className="text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Branch Selection</span>
            <select 
              value={selectedBranch}
              disabled={isLimited}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-6 py-3.5 bg-white border border-ink/5 rounded-2xl font-sans text-xs font-bold uppercase tracking-widest appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-primary/5 shadow-xl shadow-ink/[0.01] disabled:opacity-50"
            >
              {!isLimited && <option value="all">Global Matrix</option>}
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
            <span className="text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Stock Level</span>
            <select 
              value={stockLevelFilter}
              onChange={(e) => setStockLevelFilter(e.target.value)}
              className="w-full px-6 py-3.5 bg-white border border-ink/5 rounded-2xl font-sans text-xs font-bold uppercase tracking-widest appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-primary/5 shadow-xl shadow-ink/[0.01]"
            >
              <option value="all">All Levels</option>
              <option value="critical">Depleted (0)</option>
              <option value="low">Low Stock (≤ Threshold)</option>
              <option value="in-stock">In-Stock (&gt; Threshold)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
            <span className="text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Category</span>
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-6 py-3.5 bg-white border border-ink/5 rounded-2xl font-sans text-xs font-bold uppercase tracking-widest appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-primary/5 shadow-xl shadow-ink/[0.01]"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-2xl shadow-ink/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink/5 bg-background font-mono text-[9px] uppercase text-ink/40 font-bold tracking-[0.2em]">
                <th className="px-8 py-6">Branch Endpoint</th>
                {filteredProducts.map(p => (
                  <th key={p.id} className="px-8 py-6 min-w-[300px]">
                    <div className="flex items-center justify-between gap-4 mb-2">
                       <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-ink text-xs">{p.name}</span>
                          <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[8px] rounded-md normal-case font-mono">{p.category}</span>
                        </div>
                        <span className="text-primary tracking-tighter normal-case font-serif text-[11px] italic font-medium">{p.unit} unit</span>
                      </div>
                      {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                        <button 
                          onClick={() => {
                            setEditingProduct(p);
                            setEditForm({ 
                              name: p.name, 
                              unit: p.unit, 
                              price: (p.price || 0).toString(), 
                              cost_price: (p.cost_price || 0).toString() 
                            });
                          }}
                          className="p-2 hover:bg-primary/10 rounded-xl text-primary transition-all active:scale-90"
                          title="Edit Resource Details"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-4">
                      <div className="flex flex-col">
                        <span className="text-ink font-mono text-base font-black tracking-tighter">${p.price || 0}</span>
                        <span className="text-[9px] text-ink/30 tracking-widest">Sale Price</span>
                      </div>
                      <div className="w-px h-8 bg-ink/5" />
                      <div className="flex flex-col">
                        <span className="text-ink/60 font-mono text-base font-bold tracking-tighter">${p.cost_price || 0}</span>
                        <span className="text-[9px] text-ink/30 tracking-widest">Asset Cost</span>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.03]">
              {filteredBranches.map(branch => (
                <tr key={branch.id} className="hover:bg-background/40 transition-colors group">
                  <td className="px-8 py-8">
                    <div className="flex flex-col">
                      <span className="font-serif text-xl font-medium text-ink group-hover:text-primary transition-colors">{branch.name}</span>
                      <span className="text-[10px] font-mono text-ink/30 font-bold uppercase tracking-widest">{branch.id}</span>
                    </div>
                  </td>
                  {filteredProducts.map(product => {
                    const item = inventory.find(i => i.branch_id === branch.id && i.product_id === product.id);
                    const stock = item ? item.stock : 0;
                    const threshold = item ? (item.low_stock_threshold || 5) : 5;
                    const isCritical = stock === 0;
                    const isLow = stock > 0 && stock <= threshold;
                    return (
                      <td key={product.id} className="px-8 py-8">
                        <div className="flex items-center gap-8">
                          <div 
                            onClick={() => {
                              if (!isLimited) {
                                setThresholdUpdate({ branchId: branch.id, productId: product.id, current: threshold });
                                setThresholdAmount(threshold.toString());
                              }
                            }}
                            className={`flex flex-col items-center justify-center w-20 h-20 rounded-[2rem] border-2 transition-all cursor-pointer group/stock relative ${
                            isCritical 
                              ? 'bg-danger/5 border-danger text-danger shadow-lg shadow-danger/10 scale-110' 
                              : isLow
                                ? 'bg-amber-500/5 border-amber-500 text-amber-600 shadow-lg shadow-amber-500/10'
                                : 'bg-background border-ink/5 text-ink'
                          }`}>
                            <span className="font-mono text-2xl font-black tracking-tighter">{stock}</span>
                            <span className="text-[9px] font-mono opacity-40 uppercase font-black">Level</span>
                            
                            {!isLimited && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-ink/10 rounded-lg flex items-center justify-center shadow-sm opacity-0 group-hover/stock:opacity-100 transition-opacity">
                                <Edit3 className="w-3 h-3 text-ink/40" />
                              </div>
                            )}
                            
                            <div className="absolute -bottom-6 opacity-0 group-hover/stock:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                               <p className="text-[8px] font-mono font-bold text-ink/20 uppercase tracking-tighter">Threshold: {threshold}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-3">
                            <div className="flex gap-2">
                              <div className="flex flex-col gap-2">
                                <button 
                                  onClick={() => onUpdate(branch.id, product.id, 1, 'add', 'Fast Increment')}
                                  className="p-2.5 bg-accent/10 hover:bg-accent text-accent hover:text-white rounded-xl transition-all active:scale-90"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => onUpdate(branch.id, product.id, 1, 'remove', 'Fast Decrement')}
                                  className="p-2.5 bg-danger/10 hover:bg-danger text-danger hover:text-white rounded-xl transition-all active:scale-90"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                              </div>
                              
                              <div className="flex flex-col gap-2">
                                <button 
                                  onClick={() => setManualUpdate({ branchId: branch.id, productId: product.id, type: 'add' })}
                                  className="p-2.5 border-2 border-accent/20 hover:bg-accent/5 text-accent rounded-xl transition-all active:scale-90"
                                  title="Precise Add"
                                >
                                  <Edit3 className="w-4 h-4 transform rotate-180" />
                                </button>
                                <button 
                                  onClick={() => setManualUpdate({ branchId: branch.id, productId: product.id, type: 'remove' })}
                                  className="p-2.5 border-2 border-danger/20 hover:bg-danger/5 text-danger rounded-xl transition-all active:scale-90"
                                  title="Precise Remove"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              </div>

                              <button 
                                onClick={() => setQrModal({ branchId: branch.id, productId: product.id })}
                                className="px-3 bg-ink text-white rounded-xl hover:bg-primary transition-all active:scale-90 flex flex-col items-center justify-center gap-1 group/qr"
                              >
                                <QrCode className="w-5 h-5" />
                                <span className="text-[8px] font-mono uppercase font-black">QR</span>
                              </button>
                            </div>

                            {/* Mercury Conversion Shortcut */}
                            {product.id === '30g-mercury' && (profile?.role === 'Supervisor' || profile?.role === 'Manager' || profile?.role === 'Administrator') && (
                              <button
                                onClick={() => {
                                  const kgInv = inventory.find(i => i.branch_id === branch.id && i.product_id === '1kg-mercury');
                                  if (!kgInv || Number(kgInv.stock) < 1) {
                                    alert("Cannot convert: No 1kg Mercury units available in this branch.");
                                    return;
                                  }
                                  if (confirm("Confirm Conversion: Convert 1kg unit of Mercury into 33 units of 30g?")) {
                                    handleConvert(branch.id);
                                  }
                                }}
                                disabled={isConverting === branch.id}
                                className={`w-full py-2.5 ${isCritical || isLow ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary/20 text-primary hover:bg-primary/30'} text-white rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 overflow-hidden`}
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                {isConverting === branch.id ? 'Processing...' : 'Convert 1kg -> 33 units'}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

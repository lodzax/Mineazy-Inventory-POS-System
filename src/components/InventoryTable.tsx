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
  transferStock: (sourceBranchId: string, destBranchId: string, productId: string, amount: number, notes: string) => void;
  profile: any;
}

export default function InventoryTable({ inventory, branches, products, onUpdate, updateProduct, updateThreshold, convertMercury, transferStock, profile }: InventoryTableProps) {
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

  const [stockLevelFilter, setStockLevelFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [manualUpdate, setManualUpdate] = useState<{ branchId: string, productId: string, type: 'add' | 'remove' } | null>(null);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualNotes, setManualNotes] = useState<string>('');
  const [qrModal, setQrModal] = useState<{ branchId: string, productId: string } | null>(null);
  const [editingStock, setEditingStock] = useState<{ branchId: string, productId: string, value: string } | null>(null);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', unit: '', price: '', cost_price: '' });
  const [thresholdUpdate, setThresholdUpdate] = useState<{ branchId: string, productId: string, current: number } | null>(null);
  const [thresholdAmount, setThresholdAmount] = useState<string>('');

  const [transferModal, setTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({
    sourceBranch: '',
    destBranch: '',
    productId: '',
    amount: '',
    notes: ''
  });

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (transferData.sourceBranch && transferData.destBranch && transferData.productId && transferData.amount) {
      if (transferData.sourceBranch === transferData.destBranch) {
        alert("Source and destination nodes must be distinct.");
        return;
      }
      
      const sourceInv = inventory.find(i => i.branch_id === transferData.sourceBranch && i.product_id === transferData.productId);
      const currentStock = sourceInv ? Number(sourceInv.stock) : 0;
      const transferAmount = parseFloat(transferData.amount);

      if (transferAmount > currentStock) {
        alert(`Insufficient magnitudes. Source node only has ${currentStock} units available.`);
        return;
      }

      transferStock(
        transferData.sourceBranch,
        transferData.destBranch,
        transferData.productId,
        transferAmount,
        transferData.notes
      );
      setTransferModal(false);
      setTransferData({ sourceBranch: '', destBranch: '', productId: '', amount: '', notes: '' });
    }
  };

  const filteredProducts = products.filter(p => {
    // Improved search: split into terms and match all terms
    const searchTerms = search.toLowerCase().trim().split(/\s+/);
    const matchesSearch = searchTerms.every(term => 
      p.name.toLowerCase().includes(term) || 
      (p.category && p.category.toLowerCase().includes(term))
    );
    
    return search === '' || matchesSearch;
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

  const handleInlineStockUpdate = (branchId: string, productId: string, newValue: string, currentValue: number) => {
    const val = parseFloat(newValue);
    if (isNaN(val)) return;
    
    const delta = val - currentValue;
    if (delta === 0) {
      setEditingStock(null);
      return;
    }

    const type = delta > 0 ? 'add' : 'remove';
    onUpdate(branchId, productId, Math.abs(delta), type, 'Inline magnitude adjustment');
    setEditingStock(null);
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
      
      <AnimatePresence>
        {transferModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md"
          >
            <motion.form 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              onSubmit={handleTransferSubmit}
              className="bg-white p-10 rounded-[3rem] w-full max-w-lg border border-white/10 shadow-2xl space-y-8"
            >
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                  <ArrowRightLeft className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-3xl font-serif font-medium text-ink">Node-to-Node Transfer</h3>
                  <p className="text-[10px] font-mono text-ink/40 uppercase font-bold tracking-widest mt-1">Inter-Branch Resource Relocation</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Source Node</label>
                  <select 
                    required
                    value={transferData.sourceBranch}
                    onChange={(e) => setTransferData({...transferData, sourceBranch: e.target.value})}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold uppercase text-[10px]"
                  >
                    <option value="">SELECT ORIGIN</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Destination Node</label>
                  <select 
                    required
                    value={transferData.destBranch}
                    onChange={(e) => setTransferData({...transferData, destBranch: e.target.value})}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold uppercase text-[10px]"
                  >
                    <option value="">SELECT TARGET</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-6">
                <div className="col-span-3 space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Artifact Type</label>
                  <select 
                    required
                    value={transferData.productId}
                    onChange={(e) => setTransferData({...transferData, productId: e.target.value})}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold uppercase text-[10px]"
                  >
                    <option value="">SELECT PRODUCT</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Magnitude</label>
                  <input 
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={transferData.amount}
                    onChange={(e) => setTransferData({...transferData, amount: e.target.value})}
                    className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold text-xl"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Transfer Manifest</label>
                <textarea 
                  value={transferData.notes}
                  onChange={(e) => setTransferData({...transferData, notes: e.target.value})}
                  className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium resize-none h-24"
                  placeholder="Notes for record keeping..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setTransferModal(false)}
                  className="flex-1 py-4 font-bold text-[10px] text-ink uppercase tracking-widest hover:bg-background rounded-2xl transition-all"
                >
                  Abort
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 font-bold text-[10px] bg-primary text-white rounded-2xl uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Consign Transfer
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

        {!isLimited && (
          <button 
            onClick={() => setTransferModal(true)}
            className="w-full lg:w-auto px-8 py-4 bg-ink text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl shadow-ink/10"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Inter-Node Transfer
          </button>
        )}

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
                    const isEditing = editingStock?.branchId === branch.id && editingStock?.productId === product.id;

                    return (
                      <td key={product.id} className="px-8 py-8">
                        <div className="flex items-center gap-6">
                          {/* Stock Level Display / Input */}
                          <div 
                            className={`flex flex-col items-center justify-center w-24 h-24 rounded-[2rem] border-2 transition-all relative ${
                            isEditing 
                              ? 'bg-white border-primary shadow-2xl shadow-primary/10 ring-4 ring-primary/5 scale-105 z-10'
                              : isCritical 
                                ? 'bg-danger/5 border-danger text-danger shadow-lg shadow-danger/10 scale-105' 
                                : isLow
                                  ? 'bg-amber-500/5 border-amber-500 text-amber-600'
                                  : 'bg-background border-ink/5 text-ink hover:border-ink/20 cursor-text'
                          }`}
                            onClick={() => !isEditing && setEditingStock({ branchId: branch.id, productId: product.id, value: stock.toString() })}
                          >
                            {isEditing ? (
                              <input 
                                autoFocus
                                type="number"
                                value={editingStock.value}
                                onChange={(e) => setEditingStock({...editingStock, value: e.target.value})}
                                onBlur={() => handleInlineStockUpdate(branch.id, product.id, editingStock.value, stock)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleInlineStockUpdate(branch.id, product.id, editingStock.value, stock);
                                  if (e.key === 'Escape') setEditingStock(null);
                                }}
                                className="w-full bg-transparent text-center font-mono text-3xl font-black text-ink focus:outline-none"
                              />
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="font-mono text-3xl font-black tracking-tighter select-none">
                                  {stock}
                                </span>
                                <span className="text-[8px] font-mono opacity-30 uppercase font-black tracking-widest -mt-1">Units</span>
                              </div>
                            )}

                            {!isEditing && (
                              <div className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  className="p-1.5 bg-white border border-ink/10 rounded-lg shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setThresholdUpdate({ branchId: branch.id, productId: product.id, current: threshold });
                                    setThresholdAmount(threshold.toString());
                                  }}
                                >
                                  <ChevronUp className="w-3 h-3 text-ink/30" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Quick Controls */}
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-1.5">
                              <button 
                                onClick={() => onUpdate(branch.id, product.id, 1, 'add', 'Single unit increment (+1)')}
                                className="flex-1 h-10 flex items-center justify-center gap-1 bg-accent/5 hover:bg-accent text-accent hover:text-white border border-accent/10 rounded-xl transition-all active:scale-90"
                                title="Add 1 Unit"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-mono font-black">1</span>
                              </button>
                              <button 
                                onClick={() => onUpdate(branch.id, product.id, 1, 'remove', 'Single unit decrement (-1)')}
                                disabled={stock <= 0}
                                className="flex-1 h-10 flex items-center justify-center gap-1 bg-danger/5 hover:bg-danger text-danger hover:text-white border border-danger/10 rounded-xl transition-all active:scale-90 disabled:opacity-30 disabled:hover:bg-danger/5 disabled:hover:text-danger"
                                title="Remove 1 Unit"
                              >
                                <Minus className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-mono font-black">1</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                              <button 
                                onClick={() => setManualUpdate({ branchId: branch.id, productId: product.id, type: 'add' })}
                                className="h-10 flex items-center justify-center bg-background border border-ink/5 hover:border-accent text-ink/40 hover:text-accent rounded-xl transition-all active:scale-95 text-[9px] font-mono font-black uppercase tracking-widest"
                                title="Bulk Add with Transaction Manifest"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                REF
                              </button>
                              <button 
                                onClick={() => setManualUpdate({ branchId: branch.id, productId: product.id, type: 'remove' })}
                                className="h-10 flex items-center justify-center bg-background border border-ink/5 hover:border-danger text-ink/40 hover:text-danger rounded-xl transition-all active:scale-95 text-[9px] font-mono font-black uppercase tracking-widest"
                                title="Bulk Remove with Transaction Manifest"
                              >
                                <Minus className="w-3 h-3 mr-1" />
                                REF
                              </button>
                            </div>

                            <button 
                              onClick={() => setQrModal({ branchId: branch.id, productId: product.id })}
                              className="w-full py-2 bg-ink text-white/90 hover:bg-primary hover:text-white rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span className="text-[9px] font-mono font-black uppercase tracking-widest">Source QR</span>
                            </button>
                          </div>
                          
                          {/* Mercury Conversion Shortcut */}
                          {product.id === '30g-mercury' && (profile?.role === 'Supervisor' || profile?.role === 'Manager' || profile?.role === 'Administrator') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
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
                              className={`mt-3 w-full py-2.5 ${isCritical || isLow ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary/20 text-primary hover:bg-primary/30'} text-white rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 overflow-hidden`}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              {isConverting === branch.id ? 'Processing...' : 'Convert 1kg -> 33 units'}
                            </button>
                          )}
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

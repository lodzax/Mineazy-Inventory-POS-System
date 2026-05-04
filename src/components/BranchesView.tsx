import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  MapPin, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X,
  Store,
  Package,
  DollarSign,
  ArrowRight
} from 'lucide-react';

interface BranchesViewProps {
  branches: any[];
  products: any[];
  inventory: any[];
  sales: any[];
  addBranch: (name: string, location: string) => Promise<void>;
  updateBranch: (id: string, updates: { name?: string, location?: string }) => Promise<void>;
  deleteBranch: (id: string) => Promise<void>;
}

export default function BranchesView({ branches, products, inventory, sales, addBranch, updateBranch, deleteBranch }: BranchesViewProps) {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewingBranch, setViewingBranch] = useState<any>(null);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.location?.toLowerCase().includes(search.toLowerCase())
  );

  const getBranchMetrics = (branchId: string) => {
    const branchInventory = inventory.filter(i => i.branch_id === branchId);
    const branchSales = sales.filter(s => s.branch_id === branchId);
    
    const totalInventoryItems = branchInventory.reduce((sum, item) => sum + (item.stock || 0), 0);
    const totalRevenue = branchSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    
    const inventoryByProduct = branchInventory.map(item => {
      const product = products.find(p => p.id === item.product_id);
      return {
        ...item,
        productName: product?.name || 'Unknown Product',
        unit: product?.unit || 'units'
      };
    }).filter(i => i.stock > 0);

    return { totalInventoryItems, totalRevenue, inventoryByProduct, salesCount: branchSales.length };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBranch) {
      await updateBranch(editingBranch.id, { name, location });
    } else {
      await addBranch(name, location);
    }
    closeModal();
  };

  const openModal = (branch?: any) => {
    if (branch) {
      setEditingBranch(branch);
      setName(branch.name);
      setLocation(branch.location || '');
    } else {
      setEditingBranch(null);
      setName('');
      setLocation('');
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBranch(null);
    setName('');
    setLocation('');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this branch? This action cannot be undone.')) {
      await deleteBranch(id);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="relative w-full md:w-[450px]">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
          <input 
            type="text"
            placeholder="Search operational nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-14 pr-6 py-5 bg-white border border-ink/5 rounded-[2rem] shadow-xl shadow-ink/[0.01] focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all font-medium"
          />
        </div>

        <button 
          onClick={() => openModal()}
          className="w-full md:w-auto px-10 py-5 bg-ink text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 hover:translate-y-[-4px] transition-all shadow-2xl shadow-ink/20 active:scale-95"
        >
          <Plus className="w-4 h-4 text-primary" />
          Establish Node
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredBranches.map((branch) => {
          const metrics = getBranchMetrics(branch.id);
          return (
            <motion.div
              layout
              key={branch.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-ink/5 p-8 rounded-[3rem] shadow-xl shadow-ink/[0.01] hover:shadow-2xl hover:shadow-ink/[0.03] transition-all group cursor-pointer relative overflow-hidden"
              onClick={() => setViewingBranch(branch)}
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                <Store className="w-32 h-32 text-ink" />
              </div>

              <div className="flex justify-between items-start mb-8 relative z-10">
                <div className="w-14 h-14 bg-background rounded-[1.25rem] flex items-center justify-center text-ink/20 group-hover:text-primary transition-colors">
                  <Store className="w-8 h-8" />
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => openModal(branch)}
                    className="p-3 bg-background hover:bg-ink hover:text-white rounded-xl transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(branch.id)}
                    className="p-3 bg-secondary/5 hover:bg-danger hover:text-white text-danger/40 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-3xl font-serif font-medium text-ink mb-2 italic leading-tight group-hover:text-primary transition-colors">{branch.name}</h3>
              
              <div className="flex items-center gap-3 text-ink/40 text-[10px] font-mono font-bold uppercase tracking-widest mb-8">
                <MapPin className="w-4 h-4 text-primary opacity-40" />
                <span className="truncate">{branch.location || 'ORBITAL ADDRESS UNSET'}</span>
              </div>

              <div className="grid grid-cols-2 gap-8 py-6 border-y border-ink/5 relative z-10">
                <div className="space-y-1">
                  <p className="text-[9px] font-mono font-black text-ink/20 uppercase tracking-[0.2em]">Stored Units</p>
                  <p className="text-2xl font-mono font-black text-ink tracking-tighter">{metrics.totalInventoryItems.toLocaleString()}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[9px] font-mono font-black text-ink/20 uppercase tracking-[0.2em]">Flux Magnitude</p>
                  <p className="text-2xl font-mono font-black text-ink tracking-tighter">${metrics.totalRevenue.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between relative z-10">
                <span className="text-[9px] font-mono font-black text-ink/10 uppercase tracking-[0.3em]">Node Endpoint</span>
                <span className="text-[9px] font-mono text-ink/30 font-bold uppercase tracking-tighter">#{branch.id.slice(0, 12)}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {viewingBranch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingBranch(null)}
              className="absolute inset-0 bg-ink/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="relative w-full max-w-4xl bg-white rounded-[4rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-white/10"
            >
              <div className="p-12 pb-8 border-b border-ink/5 flex justify-between items-center bg-background/50">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-ink text-primary rounded-[2rem] flex items-center justify-center shadow-xl shadow-ink/20 rotate-3">
                    <Store className="w-10 h-10" />
                  </div>
                  <div>
                    <h2 className="text-4xl font-serif font-medium text-ink italic leading-tight">{viewingBranch.name}</h2>
                    <p className="text-ink/40 text-[10px] font-mono font-black uppercase tracking-widest flex items-center gap-2 mt-2">
                      <MapPin className="w-4 h-4 text-primary" /> {viewingBranch.location}
                    </p>
                  </div>
                </div>
                <button onClick={() => setViewingBranch(null)} className="p-4 bg-background hover:bg-ink hover:text-white rounded-full transition-all active:scale-90">
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                {/* Metrics Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="bg-background border border-ink/5 p-8 rounded-[3rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                       <Package className="w-16 h-16 text-primary" />
                    </div>
                    <p className="text-[9px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] mb-3">Resource Inventory</p>
                    <p className="text-5xl font-mono font-black text-ink tracking-tighter">{getBranchMetrics(viewingBranch.id).totalInventoryItems.toLocaleString()}</p>
                    <p className="text-[10px] font-mono text-primary font-bold mt-2 uppercase tracking-widest leading-none">Total Artifacts</p>
                  </div>
                  <div className="bg-background border border-ink/5 p-8 rounded-[3rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                       <DollarSign className="w-16 h-16 text-primary" />
                    </div>
                    <p className="text-[9px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] mb-3">Cumulative Flux</p>
                    <p className="text-5xl font-mono font-black text-ink tracking-tighter">${getBranchMetrics(viewingBranch.id).totalRevenue.toLocaleString()}</p>
                    <p className="text-[10px] font-mono text-primary font-bold mt-2 uppercase tracking-widest leading-none">Net Magnitude</p>
                  </div>
                  <div className="bg-background border border-ink/5 p-8 rounded-[3rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                       <ArrowRight className="w-16 h-16 text-primary" />
                    </div>
                    <p className="text-[9px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] mb-3">Sequence Volume</p>
                    <p className="text-5xl font-mono font-black text-ink tracking-tighter">{getBranchMetrics(viewingBranch.id).salesCount}</p>
                    <p className="text-[10px] font-mono text-primary font-bold mt-2 uppercase tracking-widest leading-none">Unique Transmissions</p>
                  </div>
                </div>

                {/* Inventory Breakdown */}
                <div className="space-y-6">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="text-[10px] font-mono font-black text-ink/40 uppercase tracking-[0.3em] flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-primary" />
                      Material Breakdown Matrix
                    </h3>
                    <span className="text-[9px] font-mono text-ink/20 font-bold uppercase">Update Realtime</span>
                  </div>
                  
                  <div className="bg-white border border-ink/5 rounded-[3rem] overflow-hidden shadow-2xl shadow-ink/[0.01]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-background font-mono text-[9px] font-black uppercase tracking-[0.2em] text-ink/40 border-b border-ink/5">
                            <th className="px-10 py-6">Resource Allocation</th>
                            <th className="px-10 py-6 text-right">Inventory Magnitude</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/[0.03]">
                          {getBranchMetrics(viewingBranch.id).inventoryByProduct.map((item, idx) => (
                            <tr key={idx} className="hover:bg-background transition-all group">
                              <td className="px-10 py-6 font-serif text-lg italic text-ink font-medium">{item.productName}</td>
                              <td className="px-10 py-6 text-right">
                                <span className="font-mono font-black text-2xl text-ink tracking-tighter">{item.stock}</span>
                                <span className="text-[9px] font-mono text-primary font-black ml-2 uppercase tracking-widest">{item.unit}</span>
                              </td>
                            </tr>
                          ))}
                          {getBranchMetrics(viewingBranch.id).inventoryByProduct.length === 0 && (
                            <tr>
                              <td colSpan={2} className="px-10 py-24 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-10">
                                  <Package className="w-12 h-12" />
                                  <p className="font-serif italic text-xl">The storage matrix is currently depleted.</p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-ink/70 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-white/10"
            >
              <div className="p-10">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h2 className="text-4xl font-serif font-medium text-ink italic leading-none">
                      {editingBranch ? 'Reconfigure' : 'Initialize'}
                    </h2>
                    <p className="text-primary text-[10px] font-mono font-black uppercase tracking-widest mt-2">
                      {editingBranch ? 'Update Node Attributes' : 'Establish Network Protocol'}
                    </p>
                  </div>
                  <button onClick={closeModal} className="p-3 bg-background hover:bg-ink hover:text-white rounded-full transition-all active:scale-90">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] block ml-1">
                      Node Designation
                    </label>
                    <input 
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. PRIMARY CORE HUB"
                      className="w-full px-6 py-5 bg-background border border-ink/5 rounded-2xl focus:ring-4 focus:ring-primary/5 transition-all text-ink font-bold uppercase tracking-widest text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-ink/30 uppercase tracking-[0.2em] block ml-1">
                      Geospatial Ref
                    </label>
                    <textarea 
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Transmission coordinates / Vector address..."
                      rows={3}
                      className="w-full px-6 py-5 bg-background border border-ink/5 rounded-2xl focus:ring-4 focus:ring-primary/5 transition-all text-ink font-medium text-xs resize-none h-32"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-6 bg-ink text-white rounded-[2rem] font-bold text-[10px] uppercase tracking-[0.3em] shadow-2xl shadow-ink/20 hover:translate-y-[-4px] transition-all active:scale-95 flex items-center justify-center gap-3"
                  >
                    {editingBranch ? 'Update Stream' : 'Deploy Node'}
                    <ArrowRight className="w-4 h-4 text-primary" />
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


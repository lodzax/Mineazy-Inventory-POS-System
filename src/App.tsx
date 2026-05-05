/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Package, 
  History, 
  QrCode, 
  LogOut, 
  Settings,
  Database,
  ArrowUpDown,
  CircleGauge,
  Menu,
  X,
  Plus,
  ClipboardList,
  PackageCheck,
  ShoppingCart,
  DollarSign,
  ArrowRightLeft,
  Building2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useInventory } from './hooks/useInventory';
import Dashboard from './components/Dashboard';
import InventoryTable from './components/InventoryTable';
import Scanner from './components/Scanner';
import OrdersView from './components/OrdersView';
import OrdersHistoryTable from './components/OrdersHistoryTable';
import POSView from './components/POSView';
import SalesHistoryTable from './components/SalesHistoryTable';
import TransferView from './components/TransferView';
import TransferHistoryTable from './components/TransferHistoryTable';
import BranchesView from './components/BranchesView';

const branches = [
  "Belmont", "Junkshop", "Tongogara", "Esigodini 1", "Esigodini 2", 
  "Mthwakazi", "Mswela", "VID", "Thobelani", "Maphisa", 
  "Gweru-Luton Rd", "Gweru-Bradford rd"
];

const products = [
  { id: '30g-mercury', name: '30g Mercury', unit: 'pcs', category: 'Chemicals', price: 23, cost_price: 15.15 },
  { id: '500g-mercury', name: '500g Mercury', unit: 'pcs', category: 'Chemicals', price: 325, cost_price: 250 },
  { id: '1kg-mercury', name: '1kg Mercury', unit: 'pcs', category: 'Chemicals', price: 650, cost_price: 500 },
  { id: 'batteries', name: 'Batteries', unit: 'pcs', category: 'Energy', price: 2, cost_price: 1.7 },
  { id: 'beaters', name: 'MID Beaters', unit: 'pcs', category: 'Machinery', price: 2.5, cost_price: 2.21 }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'orders' | 'orders_history' | 'pos' | 'sales_history' | 'transfers' | 'transfers_history' | 'branches'>('dashboard');
  const [showScanner, setShowScanner] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationRole, setRegistrationRole] = useState<'Administrator' | 'Manager' | 'Supervisor' | 'Cashier' | 'Warehouse'>('Cashier');
  const [registrationBranch, setRegistrationBranch] = useState<string>('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const { 
    inventory, 
    branches: dbBranches, 
    products: dbProducts, 
    transactions, 
    orders, 
    sales,
    transfers,
    updateStocks, 
    addProduct, 
    createOrder, 
    dispatchOrder, 
    cancelOrder, 
    acknowledgeOrder,
    processSale,
    transferStock,
    updateProduct,
    addBranch,
    updateBranch,
    deleteBranch,
    loading: dataLoading,
    authLoading,
    user,
    profile // Destructure profile
  } = useInventory();

  const [newProductName, setNewProductName] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('General');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCost, setNewProductCost] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);


  useEffect(() => {
    if (profile?.role === 'Cashier' && activeTab !== 'pos') {
      setActiveTab('pos');
    } else if (profile?.role === 'Supervisor' && activeTab === 'dashboard') {
      setActiveTab('inventory');
    } else if (profile?.role === 'Warehouse' && (activeTab === 'dashboard' || activeTab === 'pos' || activeTab === 'sales_history' || activeTab === 'history')) {
      setActiveTab('orders');
    }
  }, [profile, activeTab]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProductName && newProductUnit && newProductPrice) {
      await addProduct(newProductName, newProductUnit, parseFloat(newProductPrice), parseFloat(newProductCost || '0'), newProductCategory);
      setNewProductName('');
      setNewProductUnit('');
      setNewProductCategory('General');
      setNewProductPrice('');
      setNewProductCost('');
      setShowProductModal(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData.user) {
          // Use upsert to handle the trigger-created profile
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            email,
            role: registrationRole,
            branch_id: (registrationRole === 'Supervisor' || registrationRole === 'Cashier') ? (registrationBranch || null) : null
          });
          if (profileError) {
            console.error("Profile update failed", profileError);
          }
        }

        alert("Registration successful! You can now sign in.");
        setAuthMode('signin');
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const seedData = async () => {
    if (!user) return;
    try {
      for (const name of branches) {
        const id = name.toLowerCase().replace(/\s+/g, '-');
        await supabase.from('branches').upsert({ id, name });
      }
      for (const product of products) {
        await supabase.from('products').upsert(product);
      }
      alert("System initialized successfully.");
    } catch (err) {
      console.error("Seeding failed", err);
      alert("Failed to initialize system. Check permissions.");
    }
  };

  const handleScan = (data: string) => {
    // Expected format: branchId:productId:amount:type
    const parts = data.split(':');
    if (parts.length === 4) {
      const [bid, pid, amt, type] = parts;
      
      // Enforce branch isolation for limited roles
      const isLimited = profile?.role === 'Supervisor' || profile?.role === 'Cashier';
      if (isLimited && profile?.branch_id && bid !== profile.branch_id) {
        alert("Access Denied: You can only update stock for your assigned branch.");
        return;
      }

      updateStocks(bid, pid, parseFloat(amt), type as any, 'Scanned via QR Code');
      setShowScanner(false);
      alert(`Updated ${pid} at ${bid}`);
    } else {
      alert("Invalid QR Code format. Expected 'branchId:productId:amount:type'");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <CircleGauge className="w-12 h-12 text-primary animate-spin" />
          <p className="font-mono text-sm uppercase tracking-widest text-primary font-bold">Initializing System</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-10 bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 p-8 opacity-[0.03]">
            <Database className="w-64 h-64 text-primary" />
          </div>
          
          <div className="relative z-10">
            <div className="text-center mb-10">
              <div className="flex justify-center mb-8">
                <img 
                  src="/logo.png" 
                  alt="MMS Mineazy Mining Solutions" 
                  className="h-24 w-auto object-contain"
                  onError={(e) => {
                    // Fallback to a hidden state if image is missing
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <h1 className="text-6xl font-serif font-light mb-2 text-ink">Mineazy</h1>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">Stock Management Portal</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              {authError && (
                <div className="p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-xs font-mono text-center">
                  {authError}
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Email Address</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  placeholder="name@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Password</label>
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  placeholder="••••••••"
                />
              </div>

              {authMode === 'signup' && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Assigned Role</label>
                    <select
                      required
                      value={registrationRole}
                      onChange={(e) => setRegistrationRole(e.target.value as any)}
                      className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                    >
                      <option value="Cashier">Cashier</option>
                      <option value="Supervisor">Supervisor</option>
                      <option value="Warehouse">Warehouse</option>
                      <option value="Manager">Manager</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>

                  {(registrationRole === 'Supervisor' || registrationRole === 'Cashier') && (
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Home Branch</label>
                      <select
                        required
                        value={registrationBranch}
                        onChange={(e) => setRegistrationBranch(e.target.value)}
                        className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                      >
                        <option value="">Select Branch</option>
                        {dbBranches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <button 
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-4 bg-ink text-white rounded-2xl flex items-center justify-center gap-4 hover:translate-y-[-2px] transition-all shadow-xl active:scale-95 group disabled:opacity-50 disabled:translate-y-0"
              >
                {isAuthenticating ? (
                  <CircleGauge className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="font-bold uppercase tracking-widest text-xs">
                    {authMode === 'signin' ? 'Access System' : 'Create Account'}
                  </span>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <button 
                onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                className="text-xs text-primary font-bold uppercase tracking-widest hover:underline"
              >
                {authMode === 'signin' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>

            <p className="mt-8 text-center text-[10px] text-ink/40 font-mono italic">
              Protected access for authorized personnel only.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex font-sans text-ink">
      {/* Sidebar - Desktop */}
      <motion.aside 
        animate={{ width: isSidebarCollapsed ? 100 : 288 }}
        className="hidden lg:flex flex-col bg-ink p-6 text-white relative h-screen sticky top-0"
      >
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-4 top-10 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white shadow-xl z-20 hover:scale-110 transition-transform"
        >
          {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        <div className={`mb-12 text-center transition-all duration-300 ${isSidebarCollapsed ? 'scale-75' : ''}`}>
          <h1 className={`${isSidebarCollapsed ? 'text-xl' : 'text-3xl'} font-serif font-medium mb-1 tracking-tight text-white/90 truncate`}>
            {isSidebarCollapsed ? 'M' : 'Mineazy'}
          </h1>
          {!isSidebarCollapsed && (
            <>
              <div className="h-px w-8 bg-primary mx-auto mb-1"></div>
              <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-white/40">Inventory Core</p>
            </>
          )}
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2">
          {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
            <NavItem 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
              icon={<LayoutDashboard className="w-5 h-5" />} 
              label="Live Reports" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role !== 'Cashier') && (
            <NavItem 
              active={activeTab === 'inventory'} 
              onClick={() => setActiveTab('inventory')} 
              icon={<Package className="w-5 h-5" />} 
              label="Stocks Grid" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
            <NavItem 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')} 
              icon={<History className="w-5 h-5" />} 
              label="Transaction Logs" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role !== 'Cashier' && profile?.role !== 'Warehouse') && (
            <NavItem 
              active={activeTab === 'pos'} 
              onClick={() => setActiveTab('pos')} 
              icon={<ShoppingCart className="w-5 h-5" />} 
              label="Point of Sale" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role !== 'Cashier' && profile?.role !== 'Warehouse') && (
            <NavItem 
              active={activeTab === 'sales_history'} 
              onClick={() => setActiveTab('sales_history')} 
              icon={<History className="w-5 h-5" />} 
              label="Sales Records" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role !== 'Cashier') && (
            <NavItem 
              active={activeTab === 'transfers'} 
              onClick={() => setActiveTab('transfers')} 
              icon={<ArrowRightLeft className="w-5 h-5" />} 
              label="Stock Transfers" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role !== 'Cashier') && (
            <NavItem 
              active={activeTab === 'transfers_history'} 
              onClick={() => setActiveTab('transfers_history')} 
              icon={<PackageCheck className="w-5 h-5" />} 
              label="Transfer History" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role !== 'Cashier') && (
            <NavItem 
              active={activeTab === 'orders'} 
              onClick={() => setActiveTab('orders')} 
              icon={<ClipboardList className="w-5 h-5" />} 
              label="Manage Orders" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role !== 'Cashier') && (
            <NavItem 
              active={activeTab === 'orders_history'} 
              onClick={() => setActiveTab('orders_history')} 
              icon={<PackageCheck className="w-5 h-5" />} 
              label="Order History" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
            <NavItem 
              active={activeTab === 'branches'} 
              onClick={() => setActiveTab('branches')} 
              icon={<Building2 className="w-5 h-5" />} 
              label="Branches" 
              collapsed={isSidebarCollapsed}
            />
          )}
          <NavItem 
            active={false} 
            onClick={() => setShowScanner(true)} 
            icon={<QrCode className="w-5 h-5" />} 
            label="QR Scanner" 
            collapsed={isSidebarCollapsed}
          />
        </nav>

        <div className="mt-8 pt-8 border-t border-white/10 space-y-4">
          <button 
            onClick={() => setShowScanner(true)}
            className={`w-full py-4 bg-primary text-white rounded-2xl flex items-center justify-center gap-3 hover:translate-y-[-2px] transition-all shadow-lg font-bold text-xs uppercase tracking-widest ${isSidebarCollapsed ? 'px-0' : 'px-4'}`}
          >
            <QrCode className="w-5 h-5" />
            {!isSidebarCollapsed && <span>Scanner</span>}
          </button>
          
          <div className="space-y-1">
            <p className={`text-[9px] font-mono uppercase text-white/40 font-bold tracking-widest transition-opacity ${isSidebarCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'px-4 opacity-100'}`}>Account</p>
            <button 
              onClick={logout}
              className={`flex items-center gap-3 py-3 text-danger/80 hover:bg-danger/10 hover:text-danger rounded-xl transition-all w-full text-left font-bold text-xs uppercase tracking-wider ${isSidebarCollapsed ? 'justify-center' : 'px-4'}`}
            >
              <LogOut className="w-4 h-4" />
              {!isSidebarCollapsed && <span>Log Out</span>}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-ink/5 h-16 z-40 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-ink" />
          </button>
          <span className="font-serif font-medium text-xl">Mineazy</span>
        </div>
        <button onClick={() => setShowScanner(true)} className="p-2 bg-primary text-white rounded-xl shadow-lg">
          <QrCode className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-ink/60 z-50 backdrop-blur-md"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed inset-y-0 left-0 w-[280px] bg-ink z-50 p-8 flex flex-col text-white"
            >
              <div className="flex justify-between items-center mb-10 px-2">
                <h1 className="text-3xl font-serif italic text-white">Mineazy</h1>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-white/10 rounded-full"><X className="w-5 h-5 text-white" /></button>
              </div>
              <nav className="flex-1 space-y-1.5">
                {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                  <NavItem 
                    active={activeTab === 'dashboard'} 
                    onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} 
                    icon={<LayoutDashboard className="w-5 h-5" />} 
                    label="Reports" 
                  />
                )}
                {(profile?.role !== 'Cashier') && (
                  <NavItem 
                    active={activeTab === 'inventory'} 
                    onClick={() => { setActiveTab('inventory'); setIsSidebarOpen(false); }} 
                    icon={<Package className="w-5 h-5" />} 
                    label="Inventory" 
                  />
                )}
                {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                  <NavItem 
                    active={activeTab === 'history'} 
                    onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }} 
                    icon={<History className="w-5 h-5" />} 
                    label="Transactions" 
                  />
                )}
                {(profile?.role !== 'Cashier' && profile?.role !== 'Warehouse') && (
                  <NavItem 
                    active={activeTab === 'pos'} 
                    onClick={() => { setActiveTab('pos'); setIsSidebarOpen(false); }} 
                    icon={<ShoppingCart className="w-5 h-5" />} 
                    label="POS System" 
                  />
                )}
                {(profile?.role !== 'Cashier' && profile?.role !== 'Warehouse') && (
                  <NavItem 
                    active={activeTab === 'sales_history'} 
                    onClick={() => { setActiveTab('sales_history'); setIsSidebarOpen(false); }} 
                    icon={<History className="w-5 h-5" />} 
                    label="Sales History" 
                  />
                )}
                {(profile?.role !== 'Cashier') && (
                  <NavItem 
                    active={activeTab === 'transfers'} 
                    onClick={() => { setActiveTab('transfers'); setIsSidebarOpen(false); }} 
                    icon={<ArrowRightLeft className="w-5 h-5" />} 
                    label="Transfers" 
                  />
                )}
                {(profile?.role !== 'Cashier') && (
                  <NavItem 
                    active={activeTab === 'transfers_history'} 
                    onClick={() => { setActiveTab('transfers_history'); setIsSidebarOpen(false); }} 
                    icon={<PackageCheck className="w-5 h-5" />} 
                    label="Transfer Logs" 
                  />
                )}
                {(profile?.role !== 'Cashier') && (
                  <NavItem 
                    active={activeTab === 'orders'} 
                    onClick={() => { setActiveTab('orders'); setIsSidebarOpen(false); }} 
                    icon={<ClipboardList className="w-5 h-5" />} 
                    label="Orders" 
                  />
                )}
                {(profile?.role !== 'Cashier') && (
                  <NavItem 
                    active={activeTab === 'orders_history'} 
                    onClick={() => { setActiveTab('orders_history'); setIsSidebarOpen(false); }} 
                    icon={<PackageCheck className="w-5 h-5" />} 
                    label="Order History" 
                  />
                )}
                {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                  <NavItem 
                    active={activeTab === 'branches'} 
                    onClick={() => { setActiveTab('branches'); setIsSidebarOpen(false); }} 
                    icon={<Building2 className="w-5 h-5" />} 
                    label="Branches" 
                  />
                )}
                <NavItem 
                  active={false} 
                  onClick={() => { setShowScanner(true); setIsSidebarOpen(false); }} 
                  icon={<QrCode className="w-5 h-5" />} 
                  label="QR Scanner" 
                />
              </nav>
              <button 
                onClick={logout}
                className="mt-auto flex items-center gap-3 px-4 py-3 text-red-500 font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 pt-24 lg:pt-12 px-6 lg:px-16 max-w-screen-2xl mx-auto w-full pb-12 overflow-y-auto">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
          <div>
            <h2 className="text-6xl font-serif italic mb-3 text-ink tracking-tight">
              {activeTab === 'dashboard' ? 'Business Intelligence' : 
               activeTab === 'inventory' ? 'Inventory Grid' : 
               activeTab === 'orders' ? 'Order Management' : 
               activeTab === 'pos' ? 'Direct checkout' :
               activeTab === 'sales_history' ? 'Transaction archive' :
               activeTab === 'transfers' ? 'Stock Relocation' :
               activeTab === 'transfers_history' ? 'Movement Archive' :
               activeTab === 'branches' ? 'Network Hub' :
               activeTab === 'orders_history' ? 'Order Archive' : 'System Logs'}
            </h2>
            <p className="text-xs font-mono text-ink/40 uppercase tracking-widest font-bold">
              {activeTab === 'dashboard' ? 'Performance tracking and global inventory oversight' : 
               activeTab === 'inventory' ? 'Fine-grained control over global product quantities' : 
               activeTab === 'pos' ? 'Front-facing sales interface with instant receipt generation' :
               activeTab === 'sales_history' ? 'Audited log of every point-of-sale transaction' :
               activeTab === 'transfers' ? 'Internal logistics and resource rebalancing' :
               activeTab === 'transfers_history' ? 'Verification trail for all branch movements' :
               activeTab === 'branches' ? 'Command center for all operational locations' :
               activeTab === 'orders' ? 'Digital pipeline for internal stock requests' : 
               activeTab === 'orders_history' ? 'Retrospective on fulfillment and warehouse demand' : 'Raw event logs for security and auditing'}
            </p>
          </div>

          {activeTab === 'inventory' && (
            <div className="flex gap-4">
               <button 
                onClick={() => setShowProductModal(true)}
                className="px-6 py-4 bg-ink text-white rounded-2xl text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl"
                >
                <Plus className="w-4 h-4" />
                Add Product
              </button>
              {dbBranches.length === 0 && !dataLoading && (
                <button 
                  onClick={seedData}
                  className="px-6 py-4 bg-primary text-white rounded-2xl text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl"
                >
                  <Settings className="w-4 h-4" />
                  INIT SYSTEM
                </button>
              )}
              <button 
                onClick={seedData}
                className="px-6 py-4 border-2 border-ink/10 text-ink rounded-2xl text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 hover:bg-ink/5 transition-all"
                title="Update all products to the new pricing structure"
              >
                <ArrowUpDown className="w-4 h-4" />
                Sync Prices
              </button>
            </div>
          )}
          {activeTab !== 'inventory' && dbBranches.length === 0 && !dataLoading && (
            <button 
              onClick={seedData}
              className="px-6 py-4 bg-primary text-white rounded-2xl text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl"
            >
              <Settings className="w-4 h-4" />
              INIT SYSTEM
            </button>
          )}
        </div>

        <AnimatePresence>
          {showProductModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md"
            >
              <motion.form 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                onSubmit={handleAddProduct}
                className="bg-white p-10 rounded-[3rem] w-full max-w-sm border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] space-y-8"
              >
                <div>
                  <h3 className="text-3xl font-serif font-medium text-ink">Register Product</h3>
                  <p className="text-[10px] font-mono text-primary uppercase font-bold tracking-widest mt-1">Expansion module</p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Product Name</label>
                    <input 
                      type="text"
                      required
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="e.g. Grinding Stones"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Unit of Measure</label>
                    <input 
                      type="text"
                      required
                      value={newProductUnit}
                      onChange={(e) => setNewProductUnit(e.target.value)}
                      className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="e.g. kg, pcs, boxes"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Category</label>
                    <select 
                      value={newProductCategory}
                      onChange={(e) => setNewProductCategory(e.target.value)}
                      className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                    >
                      <option value="General">General</option>
                      <option value="Chemicals">Chemicals</option>
                      <option value="Energy">Energy</option>
                      <option value="Machinery">Machinery</option>
                      <option value="Tools">Tools</option>
                      <option value="Safety">Safety</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Price ($)</label>
                      <input 
                        type="number"
                        required
                        step="0.01"
                        value={newProductPrice}
                        onChange={(e) => setNewProductPrice(e.target.value)}
                        className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Cost ($)</label>
                      <input 
                        type="number"
                        required
                        step="0.01"
                        value={newProductCost}
                        onChange={(e) => setNewProductCost(e.target.value)}
                        className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowProductModal(false)}
                    className="flex-1 py-4 font-bold text-[10px] text-ink uppercase tracking-widest hover:bg-background rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 font-bold text-[10px] bg-primary text-white rounded-2xl uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all"
                  >
                    Create
                  </button>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>

        {dataLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4">
            <CircleGauge className="w-8 h-8 text-sage/20 animate-spin" />
            <p className="font-mono text-xs uppercase text-sage/30">Synchronizing Data</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="min-h-[500px]"
            >
              {activeTab === 'dashboard' && (
                <Dashboard 
                  inventory={inventory} 
                  branches={dbBranches} 
                  products={dbProducts} 
                  orders={orders} 
                  transactions={transactions}
                  sales={sales}
                  transfers={transfers}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryTable 
                  inventory={inventory} 
                  branches={dbBranches} 
                  products={dbProducts} 
                  onUpdate={(bid, pid, amt, type, notes = '') => updateStocks(bid, pid, amt, type, notes)}
                  updateProduct={updateProduct}
                  profile={profile}
                />
              )}
              {activeTab === 'history' && (
                <HistoryTable transactions={transactions} branches={dbBranches} products={dbProducts} />
              )}
              {activeTab === 'orders' && (
                <OrdersView 
                  orders={orders} 
                  branches={dbBranches} 
                  products={dbProducts} 
                  createOrder={createOrder}
                  dispatchOrder={dispatchOrder}
                  cancelOrder={cancelOrder}
                  acknowledgeOrder={acknowledgeOrder}
                  profile={profile}
                />
              )}
              {activeTab === 'pos' && (
                <POSView 
                  products={dbProducts}
                  branches={dbBranches}
                  inventory={inventory}
                  processSale={processSale}
                  user={user}
                  profile={profile}
                />
              )}
              {activeTab === 'sales_history' && (
                <SalesHistoryTable 
                  sales={sales}
                  branches={dbBranches}
                  products={dbProducts}
                />
              )}
              {activeTab === 'transfers' && (
                <TransferView 
                  branches={dbBranches}
                  products={dbProducts}
                  inventory={inventory}
                  transferStock={transferStock}
                  profile={profile}
                />
              )}
              {activeTab === 'transfers_history' && (
                <TransferHistoryTable 
                  transfers={transfers}
                  branches={dbBranches}
                  products={dbProducts}
                />
              )}
              {activeTab === 'orders_history' && (
                <OrdersHistoryTable 
                  orders={orders}
                  branches={dbBranches}
                  products={dbProducts}
                />
              )}
              {activeTab === 'branches' && (
                <BranchesView 
                  branches={dbBranches}
                  products={dbProducts}
                  inventory={inventory}
                  sales={sales}
                  addBranch={addBranch}
                  updateBranch={updateBranch}
                  deleteBranch={deleteBranch}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <AnimatePresence>
        {showScanner && <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, collapsed?: boolean }) {
  return (
    <button 
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-4 py-4 rounded-2xl transition-all group ${
        collapsed ? 'justify-center px-0' : 'px-5'
      } ${
        active 
          ? 'bg-primary text-white shadow-[0_8px_20px_-6px_rgba(99,102,241,0.5)] scale-[1.02]' 
          : 'text-white/40 hover:bg-white/5 hover:text-white hover:scale-[1.01]'
      }`}
    >
      <div className={`transition-all ${active ? 'text-white' : 'group-hover:text-primary'}`}>
        {icon}
      </div>
      {!collapsed && (
        <span className={`font-bold text-[11px] uppercase tracking-widest transition-opacity ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>{label}</span>
      )}
      {active && !collapsed && (
        <motion.div 
          layoutId="activeIndicator"
          className="ml-auto w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white]" 
        />
      )}
    </button>
  );
}

function HistoryTable({ transactions, branches, products }: { transactions: any[], branches: any[], products: any[] }) {
  const sorted = [...transactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-xl shadow-ink/5">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-ink/5 bg-background font-mono text-[9px] uppercase text-ink/40 font-bold tracking-[0.2em]">
              <th className="px-8 py-6">Time Cycle</th>
              <th className="px-8 py-6">Operation</th>
              <th className="px-8 py-6">Node</th>
              <th className="px-8 py-6">Resource</th>
              <th className="px-8 py-6 text-right">Magnitude</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.03]">
            {sorted.map((tx, idx) => {
              const branch = branches.find(b => b.id === tx.branch_id);
              const product = products.find(p => p.id === tx.product_id);
              return (
                <tr key={idx} className="text-sm hover:bg-background/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="font-mono text-[11px] text-ink/60 font-bold">
                        {tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </span>
                      <span className="text-[10px] text-ink/30 font-mono">
                        {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : 'Pending'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-[10px] font-mono font-black uppercase px-2 py-1 rounded-md ${
                      tx.type === 'add' ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      <span className="font-bold text-ink/80 text-xs">{branch?.name || tx.branch_id}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-ink/70 text-xs font-medium">{product?.name || tx.product_id}</td>
                  <td className={`px-8 py-5 text-right font-mono font-bold text-base tracking-tighter ${
                    tx.type === 'add' ? 'text-accent' : 'text-danger'
                  }`}>
                    {tx.type === 'add' ? '+' : '-'}{tx.amount}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center text-ink/30 font-serif italic text-lg">
                  Zero movement detected in system logs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


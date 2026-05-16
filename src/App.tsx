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
  ChevronRight,
  Printer,
  FileDown,
  Filter,
  Search,
  Calendar
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useInventory } from './hooks/useInventory';
import Dashboard from './components/Dashboard';
import InventoryTable from './components/InventoryTable';
import Scanner from './components/Scanner';
import OrdersHistoryTable from './components/OrdersHistoryTable';
import POSView from './components/POSView';
import SalesHistoryTable from './components/SalesHistoryTable';
import BranchesView from './components/BranchesView';
import PurchasingView from './components/PurchasingView';
import BackupSettings from './components/BackupSettings';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const branches = [
  "Belmont", "Junkshop", "Tongogara", "Esigodini 1", "Esigodini 2", 
  "Mthwakazi", "Mswela", "VID", "Thobelani", "Maphisa", 
  "Gweru-Luton Rd", "Gweru-Bradford rd"
];

const products = [
  { id: '16.5g-mercury', name: '16.5g Mercury', unit: 'pcs', price: 12, cost_price: 7.57 },
  { id: '30g-mercury', name: '30g Mercury', unit: 'pcs', price: 23, cost_price: 15.15 },
  { id: '500g-mercury', name: '500g Mercury', unit: 'pcs', price: 325, cost_price: 250 },
  { id: '1kg-mercury', name: '1kg Mercury', unit: 'pcs', price: 650, cost_price: 500 },
  { id: 'batteries', name: 'Batteries', unit: 'pcs', price: 2, cost_price: 1.7 },
  { id: 'beaters', name: 'MID Beaters', unit: 'pcs', price: 2.5, cost_price: 2.21 }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'orders_history' | 'pos' | 'sales_history' | 'branches' | 'purchasing' | 'settings'>('dashboard');
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
    supplyOrders,
    sales,
    transfers,
    profiles,
    updateStocks, 
    addProduct, 
    initiateOrder,
    processOrder,
    cancelOrder,
    confirmReceipt,
    createSupplyOrder,
    addSupplier,
    updateSupplyOrderStatus,
    confirmSupplyReceipt,
    processSale,
    updateProduct,
    convertMercury,
    addBranch,
    updateBranch,
    deleteBranch,
    updateThreshold,
    transferStock,
    suppliers,
    error,
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
    } else if (profile?.role === 'Purchasing' && activeTab !== 'purchasing') {
      setActiveTab('purchasing');
    } else if (profile?.role === 'Warehouse' && (activeTab === 'dashboard' || activeTab === 'inventory' || activeTab === 'pos' || activeTab === 'sales_history' || activeTab === 'history')) {
      setActiveTab('orders_history');
    } else if (profile?.role === 'Supervisor' && (activeTab === 'dashboard' || activeTab === 'branches' || activeTab === 'settings')) {
      // Supervisors can access inventory, but not dashboard, branches or settings
      setActiveTab('inventory');
    }
  }, [profile, activeTab]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProductName && newProductUnit && newProductPrice) {
      await addProduct(newProductName, newProductUnit, parseFloat(newProductPrice), parseFloat(newProductCost || '0'));
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
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        throw new Error("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Settings.");
      }
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
            branch_id: (registrationRole === 'Supervisor' || registrationRole === 'Cashier' || registrationRole === 'Manager') ? (registrationBranch?.toLowerCase() || null) : null
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
              <h1 className="text-4xl font-serif font-light mb-2 text-ink">Stock Portal</h1>
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
                      <option value="Purchasing">Purchasing</option>
                      <option value="Warehouse">Warehouse</option>
                      <option value="Manager">Manager</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>

          {(registrationRole === 'Supervisor' || registrationRole === 'Cashier' || registrationRole === 'Manager') && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Home Branch</label>
              <select
                required
                value={registrationBranch}
                onChange={(e) => setRegistrationBranch(e.target.value)}
                className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
              >
                <option value="">Select Branch</option>
                {dbBranches.map((b, idx) => (
                  <option key={`${b.id}-${idx}`} value={b.id}>{b.name}</option>
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
    <div className="min-h-screen bg-background flex font-sans text-ink relative">
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg px-4"
          >
            <div className="bg-danger/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-white/20">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 flex-shrink-0" />
                <p className="text-xs font-mono font-bold leading-tight">{error}</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
              >
                Reconnect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar - Desktop */}
      <motion.aside 
        animate={{ width: isSidebarCollapsed ? 100 : 288 }}
        className="hidden lg:flex flex-col bg-ink p-6 text-white relative h-screen sticky top-0 no-print"
      >
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-4 top-10 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white shadow-xl z-20 hover:scale-110 transition-transform"
        >
          {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        <div className={`mb-12 text-center transition-all duration-300 ${isSidebarCollapsed ? 'scale-75' : ''}`}>
          <h1 className={`${isSidebarCollapsed ? 'text-xl' : 'text-3xl'} font-serif font-medium mb-1 tracking-tight text-white/90 truncate`}>
            {isSidebarCollapsed ? 'S' : 'Stock Portal'}
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
          {(profile?.role === 'Administrator' || profile?.role === 'Manager' || profile?.role === 'Supervisor') && (
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
          {(profile?.role === 'Cashier' || profile?.role === 'Supervisor' || profile?.role === 'Manager' || profile?.role === 'Administrator') && (
            <NavItem 
              active={activeTab === 'pos'} 
              onClick={() => setActiveTab('pos')} 
              icon={<ShoppingCart className="w-5 h-5" />} 
              label="Point of Sale" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role === 'Supervisor' || profile?.role === 'Manager' || profile?.role === 'Administrator') && (
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
              active={activeTab === 'orders_history'} 
              onClick={() => setActiveTab('orders_history')} 
              icon={<PackageCheck className="w-5 h-5" />} 
              label="Order History" 
              collapsed={isSidebarCollapsed}
            />
          )}
          {(profile?.role === 'Purchasing' || profile?.role === 'Administrator' || profile?.role === 'Manager') && (
            <NavItem 
              active={activeTab === 'purchasing'} 
              onClick={() => setActiveTab('purchasing')} 
              icon={<ClipboardList className="w-5 h-5" />} 
              label="Purchasing" 
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
          {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
            <NavItem 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
              icon={<Settings className="w-5 h-5" />} 
              label="Settings" 
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
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-ink/5 h-16 z-40 flex items-center justify-between px-6 shadow-sm no-print">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-ink" />
          </button>
          <span className="font-serif font-medium text-xl">Stock Portal</span>
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
                <h1 className="text-3xl font-serif italic text-white">Stock Portal</h1>
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
                {(profile?.role === 'Administrator' || profile?.role === 'Manager' || profile?.role === 'Supervisor') && (
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
                {(profile?.role === 'Cashier' || profile?.role === 'Supervisor' || profile?.role === 'Manager' || profile?.role === 'Administrator') && (
                  <NavItem 
                    active={activeTab === 'pos'} 
                    onClick={() => { setActiveTab('pos'); setIsSidebarOpen(false); }} 
                    icon={<ShoppingCart className="w-5 h-5" />} 
                    label="POS System" 
                  />
                )}
                {(profile?.role === 'Supervisor' || profile?.role === 'Manager' || profile?.role === 'Administrator') && (
                  <NavItem 
                    active={activeTab === 'sales_history'} 
                    onClick={() => { setActiveTab('sales_history'); setIsSidebarOpen(false); }} 
                    icon={<History className="w-5 h-5" />} 
                    label="Sales History" 
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
                {(profile?.role === 'Purchasing' || profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                  <NavItem 
                    active={activeTab === 'purchasing'} 
                    onClick={() => { setActiveTab('purchasing'); setIsSidebarOpen(false); }} 
                    icon={<ClipboardList className="w-5 h-5" />} 
                    label="Purchasing" 
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
                {(profile?.role === 'Administrator' || profile?.role === 'Manager') && (
                  <NavItem 
                    active={activeTab === 'settings'} 
                    onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} 
                    icon={<Settings className="w-5 h-5" />} 
                    label="Settings" 
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
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16 no-print">
          <div>
            <h2 className="text-6xl font-serif italic mb-3 text-ink tracking-tight">
              {activeTab === 'dashboard' ? 'Business Intelligence' : 
               activeTab === 'inventory' ? 'Inventory Grid' : 
               activeTab === 'pos' ? 'Direct checkout' :
               activeTab === 'sales_history' ? 'Sales Records' :
               activeTab === 'branches' ? 'Network Hub' :
               activeTab === 'purchasing' ? 'Procurement Center' :
               activeTab === 'settings' ? 'System Control' :
               activeTab === 'orders_history' ? 'Order Archive' : 'System Logs'}
            </h2>
            <p className="text-xs font-mono text-ink/40 uppercase tracking-widest font-bold">
              {activeTab === 'dashboard' ? 'Performance tracking and global inventory oversight' : 
               activeTab === 'inventory' ? 'Fine-grained control over global product quantities' : 
               activeTab === 'pos' ? 'Front-facing sales interface with instant receipt generation' :
               activeTab === 'sales_history' ? 'Audited log of every point-of-sale transaction' :
               activeTab === 'branches' ? 'Command center for all operational locations' :
               activeTab === 'purchasing' ? 'Supply order lifecycle and supplier management' :
               activeTab === 'settings' ? 'Global configuration and automated backup protocols' :
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Price ($)</label>
                      <input 
                        type="number"
                        required
                        step="0.01"
                        value={isNaN(parseFloat(newProductPrice)) ? '' : newProductPrice}
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
                        value={isNaN(parseFloat(newProductCost)) ? '' : newProductCost}
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
                />
              )}
              {activeTab === 'purchasing' && (
                <PurchasingView
                  supplyOrders={supplyOrders}
                  suppliers={suppliers}
                  branches={dbBranches}
                  products={dbProducts}
                  createSupplyOrder={createSupplyOrder}
                  addSupplier={addSupplier}
                  updateSupplyOrderStatus={updateSupplyOrderStatus}
                  confirmSupplyReceipt={confirmSupplyReceipt}
                  profile={profile}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryTable 
                  inventory={inventory} 
                  branches={dbBranches} 
                  products={dbProducts} 
                  onUpdate={(bid, pid, amt, type, notes = '') => updateStocks(bid, pid, amt, type, notes)}
                  updateProduct={updateProduct}
                  updateThreshold={updateThreshold}
                  convertMercury={convertMercury}
                  transferStock={transferStock}
                  profile={profile}
                />
              )}
              {activeTab === 'history' && (
                <HistoryTable transactions={transactions} branches={dbBranches} products={dbProducts} profile={profile} />
              )}
              {activeTab === 'pos' && profile?.role !== 'Warehouse' && (
                <POSView 
                  products={dbProducts}
                  branches={dbBranches}
                  inventory={inventory}
                  processSale={processSale}
                  user={user}
                  profile={profile}
                />
              )}
              {activeTab === 'sales_history' && profile?.role !== 'Warehouse' && (
                <SalesHistoryTable 
                  sales={sales}
                  branches={dbBranches}
                  products={dbProducts}
                  profile={profile}
                />
              )}
              {activeTab === 'orders_history' && (
                <OrdersHistoryTable 
                  orders={orders}
                  branches={dbBranches}
                  products={dbProducts}
                  profiles={profiles}
                  initiateOrder={initiateOrder}
                  processOrder={processOrder}
                  cancelOrder={cancelOrder}
                  confirmReceipt={confirmReceipt}
                  profile={profile}
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
              {activeTab === 'settings' && (
                <BackupSettings role={profile?.role || null} />
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

function HistoryTable({ transactions, branches, products, profile }: { transactions: any[], branches: any[], products: any[], profile: any }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('');
  
  const itemsPerPage = 15;

  const isAdmin = profile?.role === 'Administrator';
  const userBranchId = profile?.branch_id;

  // Filter logic
  const filtered = transactions.filter(tx => {
    // Branch boundary check
    if (!isAdmin && tx.branch_id !== userBranchId) return false;

    if (filterBranch !== 'all' && tx.branch_id !== filterBranch) return false;
    if (filterProduct !== 'all' && tx.product_id !== filterProduct) return false;
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (filterDate) {
      const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
      if (txDate !== filterDate) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginatedData = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Add Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('STOCK MANAGEMENT TRANSACTION LOGS', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 28, { align: 'center' });
    
    // Add Active Filters info
    let filterString = "Filters: ";
    if (filterBranch !== 'all') filterString += `Branch: ${branches.find(b => b.id === filterBranch)?.name || filterBranch} | `;
    if (filterProduct !== 'all') filterString += `Product: ${products.find(p => p.id === filterProduct)?.name || filterProduct} | `;
    if (filterType !== 'all') filterString += `Type: ${filterType} | `;
    if (filterDate) filterString += `Date: ${filterDate} | `;
    if (filterString === "Filters: ") filterString += "None";
    
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(filterString, 105, 35, { align: 'center' });

    const tableData = sorted.map(tx => {
      const branch = branches.find(b => b.id === tx.branch_id);
      const product = products.find(p => p.id === tx.product_id);
      return [
        new Date(tx.timestamp).toLocaleString(),
        tx.type.toUpperCase(),
        branch?.name || tx.branch_id,
        product?.name || tx.product_id,
        tx.notes || '-',
        `${tx.type === 'add' ? '+' : '-'}${tx.amount}`
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Timestamp', 'Type', 'Branch', 'Product', 'Notes', 'Amount']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8 },
      columnStyles: {
        5: { halign: 'right', fontStyle: 'bold' }
      }
    });

    doc.save(`transaction_logs_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5 no-print">
        <div className="flex items-center gap-3 mb-6">
          <Filter className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-serif font-medium">Refine Logs</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {isAdmin && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">By Node</label>
              <div className="relative">
                <select 
                  value={filterBranch}
                  onChange={(e) => { setFilterBranch(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
                >
                  <option value="all">All Branches</option>
                  {branches.map((b, idx) => (
                    <option key={`${b.id}-${idx}`} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">By Resource</label>
            <div className="relative">
              <select 
                value={filterProduct}
                onChange={(e) => { setFilterProduct(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
              >
                <option value="all">All Products</option>
                {products.map((p, idx) => (
                  <option key={`${p.id}-${idx}`} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Operation Type</label>
            <div className="relative">
              <select 
                value={filterType}
                onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
              >
                <option value="all">Any Operation</option>
                <option value="add">Addition (+)</option>
                <option value="subtract">Subtraction (-)</option>
                <option value="transfer">Transfer</option>
                <option value="sale">Point of Sale</option>
                <option value="restock">Restock</option>
              </select>
              <ArrowRightLeft className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Specific Date</label>
            <div className="relative">
              <input 
                type="date"
                value={filterDate}
                onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-6 py-3 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs"
              />
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            </div>
          </div>
        </div>

        {(filterBranch !== 'all' || filterProduct !== 'all' || filterType !== 'all' || filterDate) && (
          <div className="mt-6 flex justify-end">
            <button 
              onClick={() => {
                setFilterBranch('all');
                setFilterProduct('all');
                setFilterType('all');
                setFilterDate('');
                setCurrentPage(1);
              }}
              className="text-[10px] font-mono font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-2"
            >
              <X className="w-3 h-3" />
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-center justify-between px-2">
        <div className="h-px flex-1 bg-ink/5 hidden md:block" />
        <div className="flex items-center gap-3 no-print">
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
      </div>
      <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-xl shadow-ink/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink/5 bg-background font-mono text-[9px] uppercase text-ink/40 font-bold tracking-[0.2em]">
                <th className="px-8 py-6">Time Cycle</th>
                <th className="px-8 py-6">Operation</th>
                <th className="px-8 py-6">Node</th>
                <th className="px-8 py-6">Resource</th>
                <th className="px-8 py-6">Notes</th>
                <th className="px-8 py-6 text-right">Magnitude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.03]">
              {paginatedData.map((tx, idx) => {
                const branch = branches.find(b => b.id === tx.branch_id);
                const product = products.find(p => p.id === tx.product_id);
                return (
                  <tr key={`${tx.id || 'tx'}-${idx}`} className="text-sm hover:bg-background/50 transition-colors group">
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
                    <td className="px-8 py-5">
                      <p className="text-[10px] text-ink/50 max-w-xs truncate font-medium italic" title={tx.notes}>
                        {tx.notes || '-'}
                      </p>
                    </td>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-8 py-4 bg-white rounded-3xl border border-ink/5 shadow-sm">
          <p className="text-[10px] font-mono font-bold text-ink/40 uppercase tracking-widest">
            Showing <span className="text-ink">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-ink">{Math.min(currentPage * itemsPerPage, sorted.length)}</span> of <span className="text-ink">{sorted.length}</span> entries
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-2 hover:bg-background rounded-xl transition-all disabled:opacity-20 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                // Show pages around current page if there are many pages
                if (
                  totalPages > 7 &&
                  pageNum !== 1 &&
                  pageNum !== totalPages &&
                  (pageNum < currentPage - 1 || pageNum > currentPage + 1)
                ) {
                  if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                    return <span key={`dots-${pageNum}`} className="text-ink/20">...</span>;
                  }
                  return null;
                }

                return (
                  <button
                    key={`page-${pageNum}`}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-8 h-8 rounded-xl font-mono text-[10px] font-bold transition-all ${
                      currentPage === pageNum 
                        ? 'bg-ink text-white shadow-lg' 
                        : 'text-ink/40 hover:bg-background hover:text-ink'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-2 hover:bg-background rounded-xl transition-all disabled:opacity-20 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleSupabaseError(error: any, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error?.message || String(error),
    operationType,
    path
  };
  console.error('Supabase Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function useInventory() {
  const [data, setData] = useState<{
    branches: any[],
    products: any[],
    inventory: any[],
    transactions: any[],
    orders: any[],
    sales: any[],
    transfers: any[]
  }>({
    branches: [],
    products: [],
    inventory: [],
    transactions: [],
    orders: [],
    sales: [],
    transfers: []
  });
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const fetchingRef = React.useRef(false);

  // Consolidated Auth and Profile Listener
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        setAuthLoading(false);
        if (!sessionUser) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        const newUser = session?.user ?? null;
        setUser(newUser);
        setAuthLoading(false);
        if (!newUser) {
          setProfile(null);
          // Initial branches fetch for login screen
          const { data: bData } = await supabase.from('branches').select('*');
          if (bData) setData(prev => ({ ...prev, branches: bData || [] }));
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
    };
  }, []);

  // Fetch Profile when user changes
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    
    const fetchProfile = async () => {
      try {
        const { data: pData, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (error) {
          console.warn('Profile fetch error or missing profile:', error.message);
          // If no profile found, stop the global loading so the UI can show a fallback or setup
          setLoading(false);
        } else if (pData) {
          setProfile(pData);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Unexpected error fetching profile:', err);
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const fetchData = React.useCallback(async () => {
    // Avoid redundant fetches if fetching already
    if (fetchingRef.current) return;

    // If no user, reset data and stop loading
    if (!user) {
      setData({
        branches: [],
        products: [],
        inventory: [],
        transactions: [],
        orders: [],
        sales: [],
        transfers: []
      });
      setLoading(false);
      return;
    }

    // If we have a user but no profile yet, we wait for the fetchProfile effect
    if (!profile) {
      return;
    }

    fetchingRef.current = true;
    try {
      const isLimited = profile?.role === 'Supervisor' || profile?.role === 'Cashier';
      const userBranch = profile?.branch_id;

      // Optimize: only fetch what we need and add limits for performance
      let bQuery = supabase.from('branches').select('*');
      let pQuery = supabase.from('products').select('*');
      let iQuery = supabase.from('inventory').select('*');
      
      // Added limits to history tables to reduce network traffic magnitude
      let tQuery = supabase.from('transactions').select('*').order('timestamp', { ascending: false }).limit(100);
      let oQuery = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
      let sQuery = supabase.from('sales').select('*').order('timestamp', { ascending: false }).limit(100);
      let trQuery = supabase.from('transfers').select('*').order('timestamp', { ascending: false }).limit(100);

      if (isLimited && userBranch) {
        bQuery = bQuery.eq('id', userBranch);
        iQuery = iQuery.eq('branch_id', userBranch);
        tQuery = tQuery.eq('branch_id', userBranch);
        oQuery = oQuery.eq('branch_id', userBranch);
        sQuery = sQuery.eq('branch_id', userBranch);
        trQuery = trQuery.or(`from_branch_id.eq.${userBranch},to_branch_id.eq.${userBranch}`);
      }

      const [
        { data: bData },
        { data: pData },
        { data: iData },
        { data: tData },
        { data: oData },
        { data: sData },
        { data: trData }
      ] = await Promise.all([
        bQuery, pQuery, iQuery, tQuery, oQuery, sQuery, trQuery
      ]);

      setData({
        branches: bData || [],
        products: pData || [],
        inventory: (iData || []).map(i => ({ ...i, stock: Number(i.stock) })),
        transactions: (tData || []).map(t => ({ ...t, amount: Number(t.amount) })),
        orders: oData || [],
        sales: (sData || []).map(s => ({ ...s, total: Number(s.total) })),
        transfers: trData || []
      });
    } catch (err) {
      console.error("Failed to fetch inventory data", err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [user, profile]);

  // Initial Data Load
  useEffect(() => {
    if (user && profile) {
      fetchData();
    }
  }, [user, profile, fetchData]);

  const refreshData = async () => {
    setLoading(true);
    await fetchData();
  };

  const { branches, products, inventory, transactions, orders, sales, transfers } = data;

  const batchUpdateStocks = async (updates: {
    branchId: string,
    productId: string,
    amount: number,
    type: 'add' | 'remove' | 'transfer',
    notes?: string
  }[]) => {
    if (!user || updates.length === 0) return;

    try {
      // 1. Fetch current stock for all affected branch-product pairs
      // We can use an 'or' query with combinations, but for simplicity and safety, 
      // we'll fetch inventory for the involved branches
      const branchIds = Array.from(new Set(updates.map(u => u.branchId)));
      const productIds = Array.from(new Set(updates.map(u => u.productId)));

      const { data: currentInventory, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .in('branch_id', branchIds)
        .in('product_id', productIds);

      if (fetchError) throw fetchError;

      // 2. Calculate new stock values
      const inventoryMap = new Map<string, number>();
      currentInventory?.forEach(item => {
        inventoryMap.set(`${item.branch_id}:${item.product_id}`, Number(item.stock));
      });

      const finalInventoryUpdates: any[] = [];
      const transactionInserts: any[] = [];

      // We need to track intermediate changes if the same branch-product is updated multiple times in the same batch
      const workingStockMap = new Map(inventoryMap);

      for (const update of updates) {
        const key = `${update.branchId}:${update.productId}`;
        let currentStock = workingStockMap.get(key) || 0;
        
        if (update.type === 'add') currentStock += Number(update.amount);
        else if (update.type === 'remove') currentStock -= Number(update.amount);
        
        workingStockMap.set(key, currentStock);

        transactionInserts.push({
          branch_id: update.branchId,
          product_id: update.productId,
          type: update.type,
          amount: update.amount,
          timestamp: new Date().toISOString(),
          user_id: user.id,
          notes: update.notes || ''
        });
      }

      // Prepare upsert data
      for (const [key, stock] of workingStockMap.entries()) {
        const [branch_id, product_id] = key.split(':');
        finalInventoryUpdates.push({
          branch_id,
          product_id,
          stock,
          last_updated: new Date().toISOString()
        });
      }

      // 3. Perform batch operations
      const { error: invError } = await supabase
        .from('inventory')
        .upsert(finalInventoryUpdates, { onConflict: 'branch_id,product_id' });
      if (invError) throw invError;

      const { error: txError } = await supabase
        .from('transactions')
        .insert(transactionInserts);
      if (txError) throw txError;

    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'inventory/batch');
    }
  };

  const updateStocks = async (branchId: string, productId: string, amount: number, type: 'add' | 'remove' | 'transfer', notes: string = '', refresh: boolean = true) => {
    await batchUpdateStocks([{ branchId, productId, amount, type, notes }]);
    if (refresh) {
      await fetchData();
    }
  };

  const addProduct = async (name: string, unit: string, price: number, costPrice: number = 0) => {
    if (!user) return;
    const id = name.toLowerCase().replace(/\s+/g, '-');
    try {
      const { error } = await supabase
        .from('products')
        .insert({ id, name, unit, price, cost_price: costPrice });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'products');
    }
  };

  const processSale = async (branchId: string, items: { productId: string, quantity: number, price: number }[], total: number, customerName: string = '', cashierName: string = '') => {
    if (!user) return;
    try {
      // 1. Create Sale Record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          branch_id: branchId,
          items,
          total,
          customer_name: customerName,
          cashier_name: cashierName,
          timestamp: new Date().toISOString(),
          user_id: user.id
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // 2. Batch Update Stocks
      const updates = items.map(item => ({
        branchId,
        productId: item.productId,
        amount: item.quantity,
        type: 'remove' as const,
        notes: `POS Sale #${sale.id.toString().slice(0, 5)}`
      }));

      await batchUpdateStocks(updates);
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'sales');
    }
  };

  const createOrder = async (branchId: string, items: { productId: string, quantity: number }[], notes: string = '') => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('orders')
        .insert({
          branch_id: branchId,
          items,
          status: 'pending',
          created_at: new Date().toISOString(),
          notes,
          user_id: user.id
        });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'orders');
    }
  };

  const dispatchOrder = async (orderId: string) => {
    if (!user) return;
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) return;
    if (order.status !== 'pending') return;

    try {
      // 1. Batch Process items in the order
      const updates = order.items.map((item: any) => ({
        branchId: order.branch_id,
        productId: item.productId,
        amount: item.quantity,
        type: 'remove' as const,
        notes: `Dispatched via Order #${orderId.toString().slice(0, 5)}`
      }));

      await batchUpdateStocks(updates);

      // 2. Update Order Status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'dispatched',
          dispatched_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'orders/dispatch');
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'orders/cancel');
    }
  };

  const acknowledgeOrder = async (orderId: string) => {
    if (!user) return;
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) return;
    if (order.status !== 'dispatched') return;

    try {
      // 1. Batch Add items TO the branch inventory
      const updates = order.items.map((item: any) => ({
        branchId: order.branch_id,
        productId: item.productId,
        amount: item.quantity,
        type: 'add' as const,
        notes: `Received via Order #${orderId.toString().slice(0, 5)}`
      }));

      await batchUpdateStocks(updates);

      // 2. Update Order Status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'received',
          received_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'orders/acknowledge');
    }
  };

  const updateProduct = async (id: string, updates: { price?: number, cost_price?: number, unit?: string, name?: string }) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'products');
    }
  };

  const transferStock = async (fromBranchId: string, toBranchId: string, items: { productId: string, quantity: number }[], notes: string = '') => {
    if (!user) return;
    try {
      // 1. Create Transfer Record
      const { data: transfer, error: transferError } = await supabase
        .from('transfers')
        .insert({
          from_branch_id: fromBranchId,
          to_branch_id: toBranchId,
          items,
          notes,
          timestamp: new Date().toISOString(),
          user_id: user.id
        })
        .select()
        .single();

      if (transferError) throw transferError;

      // 2. Prepare Batch Updates
      const updates: any[] = [];
      for (const item of items) {
        // Deduct from Source
        updates.push({
          branchId: fromBranchId,
          productId: item.productId,
          amount: item.quantity,
          type: 'remove' as const,
          notes: `Transfer #${transfer.id.toString().slice(0, 5)} to branch ${toBranchId}`
        });

        // Add to Destination
        updates.push({
          branchId: toBranchId,
          productId: item.productId,
          amount: item.quantity,
          type: 'add' as const,
          notes: `Received via Transfer #${transfer.id.toString().slice(0, 5)} from branch ${fromBranchId}`
        });
      }

      await batchUpdateStocks(updates);
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'transfers');
    }
  };

  const addBranch = async (name: string, location: string = '') => {
    if (!user) return;
    const id = name.toLowerCase().replace(/\s+/g, '-');
    try {
      const { error } = await supabase
        .from('branches')
        .insert({ id, name, location });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'branches');
    }
  };

  const updateBranch = async (id: string, updates: { name?: string, location?: string }) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('branches')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'branches');
    }
  };

  const deleteBranch = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'branches');
    }
  };

  return { 
    branches, 
    products, 
    inventory, 
    transactions, 
    orders, 
    sales,
    transfers,
    updateStocks, 
    addProduct, 
    addBranch,
    updateBranch,
    deleteBranch,
    createOrder, 
    dispatchOrder, 
    cancelOrder, 
    acknowledgeOrder, 
    processSale,
    transferStock,
    updateProduct,
    refreshData,
    loading,
    authLoading,
    user,
    profile
  };
}

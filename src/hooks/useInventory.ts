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
  let message = error?.message || String(error);
  if (message === "Failed to fetch") {
    message = "Network Error: Failed to fetch. Please verify your connection and Supabase configuration.";
  }
  
  const errInfo = {
    error: message,
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
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = React.useRef(false);

  // Consolidated Auth and Profile Listener
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Auth session timeout")), 15000));
        const sessionPromise = supabase.auth.getSession();
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        
        if (mounted) {
          const sessionUser = session?.user ?? null;
          setUser(sessionUser);
          setAuthLoading(false);
          if (!sessionUser) {
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("[initializeAuth] Failed:", err);
        if (mounted) {
          setAuthLoading(false);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        const newUser = session?.user ?? null;
        setUser(prev => {
          if (prev?.id === newUser?.id) return prev;
          return newUser;
        });
        setAuthLoading(false);
        if (!newUser) {
          setProfile(null);
          // Initial branches fetch for login screen - with timeout
          try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Initial branches timeout")), 10000));
            const fetchPromise = supabase.from('branches').select('*');
            const { data: bData } = await Promise.race([fetchPromise, timeoutPromise]) as any;
            if (bData && mounted) setData(prev => ({ ...prev, branches: bData || [] }));
          } catch (err) {
            console.warn("[onAuthStateChange] Branch fetch failed/timed out:", err);
          }
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
    };
  }, []);

  const fetchingProfileRef = React.useRef<string | null>(null);

  // Fetch Profile when user changes
  useEffect(() => {
    if (!user) {
      setProfile(null);
      fetchingProfileRef.current = null;
      return;
    }
    
    // Prevent redundant fetches for the same user
    if (fetchingProfileRef.current === user.id) return;
    fetchingProfileRef.current = user.id;
    
    const fetchProfileWithRetry = async (retries = 2) => {
      console.log(`[fetchProfile] Attempting fetch for ${user.id}. Retries left: ${retries}`);
      const timeoutSec = 30; // Increased timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Profile fetch timed out after ${timeoutSec}s`)), timeoutSec * 1000)
      );
      
      try {
        const fetchPromise = supabase
          .from('profiles')
          .select('id, email, role, branch_id')
          .eq('id', user.id)
          .maybeSingle();

        const { data: pData, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        if (error) {
          console.warn('[fetchProfile] Query error:', error.message);
        } else if (pData) {
          console.log("[fetchProfile] Profile loaded successfully:", pData.role);
          setProfile(pData);
          return;
        } else {
          console.log("[fetchProfile] No profile record found. Attempting to ensure one exists...");
          const ensured = await ensureProfile(user);
          if (ensured) return;
        }
      } catch (err: any) {
        console.warn(`[fetchProfile] Attempt failed:`, err.message || err);
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 2000)); // Wait before retry
          return fetchProfileWithRetry(retries - 1);
        }
      }

      // Final fallback if all else fails
      console.warn("[fetchProfile] All attempts failed. Using fallback profile.");
      setProfile({ id: user.id, email: user.email, role: 'Cashier', branch_id: null });
      setLoading(false); // Stop blocking the app
    };

    fetchProfileWithRetry();
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

    // If we have a user but no profile yet, we allow a fallback to minimal data
    // instead of blocking the entire app indefinitely.
    const activeProfile = profile || { role: 'Cashier', branch_id: null };
    
    fetchingRef.current = true;
    setError(null);
    try {
      const isLimited = activeProfile.role === 'Supervisor' || activeProfile.role === 'Cashier';
      const userBranch = activeProfile.branch_id;

      // ... existing query setups ...
      let bQuery = supabase.from('branches').select('*');
      let pQuery = supabase.from('products').select('*');
      let iQuery = supabase.from('inventory').select('*');
      let tQuery = supabase.from('transactions').select('*').order('timestamp', { ascending: false }).limit(100);
      let oQuery = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
      let sQuery = supabase.from('sales').select('*').order('timestamp', { ascending: false }).limit(100);

      if (isLimited && userBranch) {
        const normalizedBranch = userBranch.toLowerCase();
        bQuery = bQuery.eq('id', normalizedBranch);
        iQuery = iQuery.eq('branch_id', normalizedBranch);
        tQuery = tQuery.eq('branch_id', normalizedBranch);
        oQuery = oQuery.eq('branch_id', normalizedBranch);
        sQuery = sQuery.eq('branch_id', normalizedBranch);
      }

      console.log("[fetchData] Executing queries...");
      const timeoutSec = 45;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Global data fetch timed out after ${timeoutSec}s`)), timeoutSec * 1000)
      );

      // Perform queries one by one or in smaller chunks if parallel is struggling
      // For now, let's stick to Promise.all but with a better timeout and logging
      const queriesPromises = Promise.all([bQuery, pQuery, iQuery, tQuery, oQuery, sQuery]);
      
      const results = await Promise.race([
        queriesPromises,
        timeoutPromise
      ]) as any;

      const [
        { data: bData, error: bErr },
        { data: pData, error: pErr },
        { data: iData, error: iErr },
        { data: tData, error: tErr },
        { data: oData, error: oErr },
        { data: sData, error: sErr }
      ] = results;

      if (bErr || pErr || iErr || tErr || oErr || sErr) {
        console.warn("[fetchData] One or more queries failed:", { bErr, pErr, iErr, tErr, oErr, sErr });
      }

      setData({
        branches: bData || [],
        products: (pData || []).map((p: any) => ({ ...p, category: p.category || 'General' })),
        inventory: (iData || []).map((i: any) => ({ 
          ...i, 
          stock: Number(i.stock),
          low_stock_threshold: Number(i.low_stock_threshold || 0)
        })),
        transactions: (tData || []).map((t: any) => ({ ...t, amount: Number(t.amount) })),
        orders: oData || [],
        sales: (sData || []).map((s: any) => ({ ...s, total: Number(s.total) })),
        transfers: []
      });
      console.log("[fetchData] Success.");
    } catch (err: any) {
      console.error("[fetchData] Failed:", err);
      let message = err?.message || "Failed to connect to database";
      if (message === "Failed to fetch") {
        message = "Network connection interrupted.";
      }
      setError(message);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [user, profile]);

  // Initial Data Load
  useEffect(() => {
    if (user) {
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
    if (!user) return null;
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
          user_id: user.id,
          timestamp: new Date().toISOString()
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
      return sale;
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'sales');
      return null;
    }
  };

  const ensureProfile = async (targetUser: any) => {
    if (!targetUser) {
      console.warn("[ensureProfile] No target user provided.");
      return null;
    }
    
    // Check cache first
    if (profile && profile.id === targetUser.id) {
      console.log("[ensureProfile] Using cached profile:", profile.email, profile.role);
      return profile;
    }
    
    console.log("[ensureProfile] Fetching profile from DB for ID:", targetUser.id);
    try {
      // Use a simpler query first
      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('id, email, role, branch_id')
        .eq('id', targetUser.id)
        .maybeSingle();

      if (profError) {
        console.error("[ensureProfile] Supabase Fetch Error:", profError.message);
      }

      if (prof) {
        console.log("[ensureProfile] Profile fetched successfully:", prof.role);
        setProfile(prof);
        return prof;
      }
      
      console.log("[ensureProfile] Profile not found, checking if we can create it...");
      
      // Double check if we are authenticated
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || authUser.id !== targetUser.id) {
        console.error("[ensureProfile] Auth mismatch or no session. Cannot create profile.");
        return null;
      }

      console.log("[ensureProfile] Attempting to create missing profile...");
      const { data: newProf, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: targetUser.id,
          email: targetUser.email || authUser.email || '',
          role: 'Cashier'
        })
        .select()
        .single();

      if (createError) {
        console.error("[ensureProfile] Profile creation failed:", createError.message);
        // It might have been created by a trigger in the background already
        const { data: retryProf } = await supabase.from('profiles').select('*').eq('id', targetUser.id).maybeSingle();
        if (retryProf) {
          setProfile(retryProf);
          return retryProf;
        }
        return null;
      }
      
      console.log("[ensureProfile] Profile created successfully.");
      setProfile(newProf);
      return newProf;
    } catch (err) {
      console.error("[ensureProfile] Unexpected exception:", err);
      return null;
    }
  };

  const initiateOrder = async (branchId: string, items: { productId: string, quantity: number }[], notes: string = '') => {
    if (!user) {
      console.error("[initiateOrder] No user session found.");
      setError("Please sign in to place orders.");
      return;
    }
    
    try {
      console.log("[initiateOrder] Start. Branch:", branchId, "Items:", items?.length);
      
      // Increased timeout for slow connections
      const timeoutSec = 30;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutSec}s. Database response is taking too long.`)), timeoutSec * 1000)
      );

      if (!items || items.length === 0) {
        throw new Error("Cannot initiate order with zero items.");
      }

      // Check if profile exists with a timeout race
      console.log("[initiateOrder] Verifying profile...");
      const prof = await Promise.race([ensureProfile(user), timeoutPromise]) as any;
      
      if (!prof) {
        throw new Error("User profile not resolved. Please try logging out and back in.");
      }
      console.log("[initiateOrder] Profile OK. Role:", prof.role);

      const insertPayload = {
        branch_id: branchId,
        items: items.map(item => ({ 
          productId: item.productId, 
          quantity: Number(item.quantity), 
          suppliedQuantity: Number(item.quantity) 
        })),
        status: 'Pending',
        created_at: new Date().toISOString(),
        user_id: user.id,
        notes: notes || ''
      };
      
      console.log("[initiateOrder] Inserting order record...");

      const insertPromise = supabase
        .from('orders')
        .insert(insertPayload)
        .select();

      const response = await Promise.race([insertPromise, timeoutPromise]) as any;
      
      console.log("[initiateOrder] Order insert response received.");

      const { data: insertedData, error: insertError } = response || {};

      if (insertError) {
        console.error("[initiateOrder] Insert Error:", insertError.message);
        throw insertError;
      }

      if (!insertedData || insertedData.length === 0) {
        throw new Error("Order was recorded but confirmation data was missing. Please check order history.");
      }

      const order = insertedData[0];
      console.log("[initiateOrder] Success! Order ID:", order.id);

      // Notify Warehouse (Non-blocking)
      try {
        console.log("[initiateOrder] Sending notifications to warehouse...");
        const staffPromise = supabase
          .from('profiles')
          .select('id')
          .in('role', ['Warehouse', 'Administrator', 'Manager']);
        
        const staffResponse = await Promise.race([staffPromise, timeoutPromise]) as any;
        const { data: warehouseStaff, error: staffError } = staffResponse || {};

        if (!staffError && warehouseStaff && warehouseStaff.length > 0) {
          const bName = branches.find(b => b.id === branchId)?.name || 'Branch';
          const notificationPayloads = warehouseStaff
            .filter((s: any) => s.id !== user.id)
            .map((s: any) => ({
              user_id: s.id,
              title: 'Order Initiated',
              message: `New pending order for ${bName}. ID: ${String(order.id).slice(0, 8)}`,
              created_at: new Date().toISOString()
            }));
          
          if (notificationPayloads.length > 0) {
            await supabase.from('notifications').insert(notificationPayloads);
          }
        }
      } catch (notifyErr) {
        console.warn("[initiateOrder] Notification failed:", notifyErr);
      }

      console.log("[initiateOrder] Syncing app state...");
      await fetchData();
      console.log("[initiateOrder] Done.");
    } catch (err: any) {
      console.error("[initiateOrder] FATAL:", err);
      setError(err?.message || "Order failed.");
      handleSupabaseError(err, OperationType.WRITE, 'orders/initiate');
    }
  };

  const processOrder = async (orderId: string | number, items: any[], notes: string = '') => {
    if (!user) return;
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .update({ 
          items, 
          notes,
          status: 'In-Transit',
          processed_at: new Date().toISOString(),
          processed_by: user.id
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      // Notify Initiator
      if (order?.user_id) {
        await supabase.from('notifications').insert({
          user_id: order.user_id,
          title: 'Order In-Transit',
          message: `Warehouse has processed order #${String(orderId).slice(0, 8)}. It is now in transit to your branch.`,
          created_at: new Date().toISOString()
        });
      }

      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'orders/process');
    }
  };

  const cancelOrder = async (orderId: string | number) => {
    if (!user) return;
    try {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*, branches(name)')
        .eq('id', orderId)
        .single();
      
      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('orders')
        .update({ status: 'Cancelled' })
        .eq('id', orderId);
      if (error) throw error;

      const bName = (order.branches as any)?.name || 'Branch';

      // 1. Notify Initiator (if not the one cancelling)
      if (order.user_id && order.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: order.user_id,
          title: 'Order Cancelled',
          message: `Order #${String(orderId).slice(0, 8)} for ${bName} has been cancelled.`,
          created_at: new Date().toISOString()
        });
      }

      // 2. Notify Warehouse staff
      const { data: staff } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['Warehouse', 'Administrator', 'Manager']);
      
      if (staff && staff.length > 0) {
        const warehouseNotifications = staff
          .filter(s => s.id !== user.id) // Don't notify the person who cancelled
          .map(s => ({
            user_id: s.id,
            title: 'Order Cancelled',
            message: `Order #${String(orderId).slice(0, 8)} for ${bName} was cancelled by ${profile?.email || 'an admin'}.`,
            created_at: new Date().toISOString()
          }));
        
        if (warehouseNotifications.length > 0) {
          await supabase.from('notifications').insert(warehouseNotifications);
        }
      }

      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'orders/cancel');
    }
  };

  const confirmReceipt = async (orderId: string | number) => {
    if (!user) return;
    try {
      const { data: order, error: fetchError } = await supabase.from('orders').select('*, branches(name)').eq('id', orderId).single();
      if (fetchError || !order) throw fetchError || new Error('Order not found');
      if (order.status !== 'In-Transit') throw new Error('Invalid order status for confirmation');

      // Update Inventory based on SUPPLIED quantity
      const updates = order.items.map((item: any) => ({
        branchId: order.branch_id,
        productId: item.productId,
        amount: item.suppliedQuantity ?? 0,
        type: 'add' as const,
        notes: `Received via Order #${String(orderId).slice(0, 5)}`
      }));

      await batchUpdateStocks(updates);

      // Final Status Update
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'Received',
          received_at: new Date().toISOString(),
          received_by: user.id
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      const bName = (order.branches as any)?.name || 'Branch';

      // 1. Notify Initiator about receipt confirmation (if not the one confirming)
      if (order.user_id && order.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: order.user_id,
          title: 'Order Received',
          message: `Order #${String(orderId).slice(0, 8)} has been marked as received at ${bName}.`,
          created_at: new Date().toISOString()
        });
      }

      // 2. Notify Warehouse staff
      const { data: staff } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['Warehouse', 'Administrator', 'Manager']);
      
      if (staff && staff.length > 0) {
        const warehouseNotifications = staff.map(s => ({
          user_id: s.id,
          title: 'Order Finalized',
          message: `${bName} has confirmed receipt of order #${String(orderId).slice(0, 8)}. stock levels synchronized.`,
          created_at: new Date().toISOString()
        }));
        await supabase.from('notifications').insert(warehouseNotifications);
      }

      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'orders/confirm');
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

  const updateThreshold = async (branchId: string, productId: string, threshold: number) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('inventory')
        .upsert({
          branch_id: branchId,
          product_id: productId,
          low_stock_threshold: threshold,
          last_updated: new Date().toISOString()
        }, { onConflict: 'branch_id,product_id' });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'inventory/threshold');
    }
  };

  const convertMercury = async (branchId: string) => {
    if (!user || !profile) return false;
    
    // Authorization check
    const allowedRoles = ['Supervisor', 'Manager', 'Administrator'];
    if (!allowedRoles.includes(profile.role)) {
      setError("Unauthorized: Only Supervisors and Admins can perform product conversions.");
      return false;
    }

    try {
      console.log(`[convertMercury] Starting conversion for branch: ${branchId}`);
      
      // 1. Verify we have enough 1kg stock in this branch
      const { data: invData, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('branch_id', branchId)
        .in('product_id', ['1kg-mercury', '30g-mercury']);

      if (fetchError) throw fetchError;

      const kgItem = invData?.find(i => i.product_id === '1kg-mercury');
      const gramItem = invData?.find(i => i.product_id === '30g-mercury');

      const kgStock = Number(kgItem?.stock || 0);
      const gramStock = Number(gramItem?.stock || 0);

      if (kgStock < 1) {
        throw new Error("Insufficient stock: 1kg unit of Mercury is not available in this branch.");
      }

      // 2. Prepare Updates
      const timestamp = new Date().toISOString();
      const inventoryUpdates = [
        {
          branch_id: branchId,
          product_id: '1kg-mercury',
          stock: kgStock - 1,
          last_updated: timestamp
        },
        {
          branch_id: branchId,
          product_id: '30g-mercury',
          stock: gramStock + 33,
          last_updated: timestamp
        }
      ];

      const transactionLogs = [
        {
          branch_id: branchId,
          product_id: '1kg-mercury',
          type: 'remove',
          amount: 1,
          timestamp,
          user_id: user.id,
          notes: 'Mercury Conversion: 1kg -> 33x30g (Approved by Supervisor)'
        },
        {
          branch_id: branchId,
          product_id: '30g-mercury',
          type: 'add',
          amount: 33,
          timestamp,
          user_id: user.id,
          notes: 'Mercury Conversion: 1kg -> 33x30g (Approved by Supervisor)'
        }
      ];

      // 3. Execute Updates
      const { error: invError } = await supabase
        .from('inventory')
        .upsert(inventoryUpdates, { onConflict: 'branch_id,product_id' });
      if (invError) throw invError;

      const { error: txError } = await supabase
        .from('transactions')
        .insert(transactionLogs);
      if (txError) throw txError;

      console.log("[convertMercury] Conversion successful.");
      await fetchData();
      return true;
    } catch (err: any) {
      console.error("[convertMercury] Failed:", err);
      setError(err?.message || "Mercury conversion failed.");
      return false;
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
    batchUpdateStocks,
    addProduct, 
    addBranch,
    updateBranch,
    deleteBranch,
    updateThreshold,
    initiateOrder,
    processOrder,
    cancelOrder,
    confirmReceipt,
    processSale,
    updateProduct,
    convertMercury,
    refreshData,
    error,
    loading,
    authLoading,
    user,
    profile
  };
}

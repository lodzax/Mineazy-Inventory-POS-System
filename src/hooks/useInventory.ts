import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.");
  }

  let message = error?.message || String(error);
  if (message === "Failed to fetch") {
    message = "Network Error: Failed to fetch. Please verify your Supabase URL and network connection.";
  }
  
  // Map specific postgres errors if needed
  if (error?.code === 'PGRST116') {
    message = "Record not found.";
  }
  
  const errInfo = {
    error: message,
    operationType,
    path,
    code: error?.code
  };
  console.error('Supabase Error: ', JSON.stringify(errInfo));
  
  // Return the friendly message instead of throwing stringified JSON if we want components to easily handle it
  // But for this app's architecture, we might want to keep the throw to trigger the error state
  throw new Error(message); 
}

/**
 * Helper to perform a Supabase query with built-in retry logic for handleable errors
 */
async function retryableRequest<T>(
  requestFn: () => Promise<{ data: T | null; error: any }>,
  retries = 3,
  delay = 1000
): Promise<{ data: T | null; error: any }> {
  try {
    const result = await requestFn();
    if (result.error) {
      // Only retry on network-like errors or temporary server errors
      const isRetryable = 
        result.error.message === 'Failed to fetch' || 
        result.error.code === '502' || 
        result.error.code === '503' ||
        result.error.code === '504';
        
      if (isRetryable && retries > 0) {
        console.warn(`[retryableRequest] Request failed, retrying in ${delay}ms... (${retries} left)`, result.error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryableRequest(requestFn, retries - 1, delay * 1.5);
      }
    }
    return result;
  } catch (err: any) {
    if ((err.message === 'Failed to fetch' || err.message?.includes('timeout')) && retries > 0) {
      console.warn(`[retryableRequest] Exception caught, retrying in ${delay}ms... (${retries} left)`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryableRequest(requestFn, retries - 1, delay * 1.5);
    }
    throw err;
  }
}

export function useInventory() {
  const [data, setData] = useState<{
    branches: any[],
    products: any[],
    inventory: any[],
    transactions: any[],
    orders: any[],
    supplyOrders: any[],
    suppliers: any[],
    sales: any[],
    transfers: any[],
    profiles: any[]
  }>({
    branches: [],
    products: [],
    inventory: [],
    transactions: [],
    orders: [],
    supplyOrders: [],
    suppliers: [],
    sales: [],
    transfers: [],
    profiles: []
  });
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const fetchingRef = React.useRef(false);

  // Consolidated Auth and Profile Listener
  useEffect(() => {
    let mounted = true;

    const checkRecoveryIndicators = () => {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const href = window.location.href || '';
      const hasRecoveryMarker = 
        hash.includes('type=recovery') || 
        search.includes('type=recovery') ||
        hash.includes('recovery') ||
        search.includes('recovery') ||
        href.includes('recovery') ||
        (hash.includes('access_token=') && hash.includes('type=')) ||
        (search.includes('code=') && (href.includes('recovery') || search.includes('type=recovery')));

      if (hasRecoveryMarker) {
        console.log("[Auth] Recovery indicators confirmed in URL hash/search. Activating recovery modal.");
        setIsRecovering(true);
      }
    };

    const initializeAuth = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Security handshake timeout")), 20000));
        
        // Wrap getSession in retryableRequest
        const { data: { session }, error } = await Promise.race([
          retryableRequest(() => supabase.auth.getSession()),
          timeoutPromise
        ]) as any;
        
        if (error) throw error;
        
        if (mounted) {
          const sessionUser = session?.user ?? null;
          setUser(sessionUser);
          setAuthLoading(false);
          checkRecoveryIndicators();
          if (!sessionUser) {
            setLoading(false);
          }
        }
      } catch (err: any) {
        console.error("[initializeAuth] Failed:", err);
        if (mounted) {
          let msg = err?.message || String(err);
          if (msg === "Failed to fetch") {
            msg = "Connection Refused: Shared infrastructure is unreachable. Please reload.";
          }
          setError(msg);
          setAuthLoading(false);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted) {
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecovering(true);
        } else {
          checkRecoveryIndicators();
        }
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
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Initial branches timeout")), 30000));
            const fetchPromise = retryableRequest(() => supabase.from('branches').select('*') as any);
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
          .select('id, email, role, branch_id, is_verified')
          .eq('id', user.id)
          .maybeSingle();

        let { data: pData, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        if (error && (error.message?.includes('is_verified') || error.code?.includes('PGRST') || error.message?.includes('column'))) {
          console.warn("[fetchProfile] is_verified column missing. Retrying with fallback fields.");
          const fallbackPromise = supabase
            .from('profiles')
            .select('id, email, role, branch_id')
            .eq('id', user.id)
            .maybeSingle();
          const fallbackRes = await Promise.race([fallbackPromise, timeoutPromise]) as any;
          if (!fallbackRes.error && fallbackRes.data) {
            pData = { ...fallbackRes.data, is_verified: true };
            error = null;
          } else {
            error = fallbackRes.error;
          }
        }
        
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
        supplyOrders: [],
        suppliers: [],
        sales: [],
        transfers: []
      });
      setLoading(false);
      return;
    }

    // Halt and deny telemetry and database reads if profile isn't resolved or is unverified
    if (!profile) {
      console.log("[fetchData] Profile is not yet resolved. Skipping database telemetry queries.");
      return;
    }

    const isVerified = profile.is_verified === true || profile.role === 'Administrator';
    if (!isVerified) {
      console.log("[fetchData] Profile is unverified. Denying inventory data querying completely.");
      setData({
        branches: [],
        products: [],
        inventory: [],
        transactions: [],
        orders: [],
        supplyOrders: [],
        suppliers: [],
        sales: [],
        transfers: []
      });
      setLoading(false);
      return;
    }

    const activeProfile = profile;
    
    fetchingRef.current = true;
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        throw new Error("Supabase configuration missing (VITE_SUPABASE_URL/KEY)");
      }

      const isLimited = activeProfile.role === 'Supervisor' || activeProfile.role === 'Cashier';
      const userBranch = activeProfile.branch_id;

      console.log("[fetchData] Executing queries...");
      const timeoutSec = 60; // Increased global timeout
      
      // We will fetch important pieces one by one or in smaller groups to prevent overloading
      const fetchWithResilience = async () => {
        const results = await Promise.all([
          retryableRequest(() => {
            let q = supabase.from('branches').select('*');
            if (isLimited && userBranch) q = q.eq('id', userBranch.toLowerCase());
            return q as any;
          }),
          retryableRequest(() => supabase.from('products').select('*') as any),
          retryableRequest(() => {
            let q = supabase.from('inventory').select('*');
            if (isLimited && userBranch) q = q.eq('branch_id', userBranch.toLowerCase());
            return q as any;
          }),
          retryableRequest(() => {
            let q = supabase.from('transactions').select('*').order('timestamp', { ascending: false }).limit(500);
            if (isLimited && userBranch) q = q.eq('branch_id', userBranch.toLowerCase());
            return q as any;
          }),
          retryableRequest(() => {
            let q = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
            if (isLimited && userBranch) q = q.eq('branch_id', userBranch.toLowerCase());
            return q as any;
          }),
          retryableRequest(() => {
            let q = supabase.from('supply_orders').select('*').order('created_at', { ascending: false }).limit(100);
            if (isLimited && userBranch) q = q.eq('destination_branch_id', userBranch.toLowerCase());
            return q as any;
          }),
          retryableRequest(async () => {
            try {
              const res = await supabase.from('suppliers').select('*').order('name', { ascending: true });
              if (res.error && res.error.code === 'PGRST205') {
                console.warn("[fetchData] Suppliers table not found in schema cache. It might not be created yet.");
                return { data: [], error: null };
              }
              return res as any;
            } catch (e) {
              return { data: [], error: null };
            }
          }),
          retryableRequest(() => {
            let q = supabase.from('sales').select('*').order('timestamp', { ascending: false }).limit(100);
            if (isLimited && userBranch) q = q.eq('branch_id', userBranch.toLowerCase());
            return q as any;
          }),
          retryableRequest(async () => {
            const res = await supabase.from('profiles').select('id, email, role, branch_id, is_verified');
            if (res.error && (res.error.message?.includes('is_verified') || res.error.code?.includes('PGRST') || res.error.message?.includes('column'))) {
              return supabase.from('profiles').select('id, email, role, branch_id');
            }
            return res;
          })
        ]);
        return results;
      };

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Global data fetch timed out after ${timeoutSec}s`)), timeoutSec * 1000)
      );
      
      const results = await Promise.race([
        fetchWithResilience(),
        timeoutPromise
      ]) as any;

      const [
        { data: bData, error: bErr },
        { data: pData, error: pErr },
        { data: iData, error: iErr },
        { data: tData, error: tErr },
        { data: oData, error: oErr },
        { data: soData, error: soErr },
        { data: supData, error: supErr },
        { data: sData, error: sErr },
        { data: prData, error: prErr }
      ] = results;

      if (bErr || pErr || iErr || tErr || oErr || soErr || supErr || sErr || prErr) {
        console.warn("[fetchData] Some queries failed even after retries.", { bErr, pErr, iErr, tErr, oErr, soErr, supErr, sErr, prErr });
        // We still proceed if we have at least branches and products as they are critical
        if (bErr || pErr) {
          throw bErr || pErr;
        }
      }

      setData({
        branches: bData || [],
        products: (pData || []).map((p: any) => ({ ...p, category: p.category || 'General' })),
        inventory: (iData || []).map((i: any) => ({ 
          ...i, 
          stock: Number(i.stock) || 0,
          low_stock_threshold: Number(i.low_stock_threshold || 0) || 0
        })),
        transactions: (tData || []).map((t: any) => ({ ...t, amount: Number(t.amount) || 0 })),
        orders: oData || [],
        supplyOrders: (soData || []).map((so: any) => ({ 
          ...so, 
          total_amount: Number(so.total_amount) || 0,
          items: (so.items || []).map((item: any) => ({
            ...item,
            quantity: Number(item.quantity) || 0,
            unitCost: Number(item.unitCost) || 0,
            vat: Number(item.vat) || 0,
            total: Number(item.total) || 0
          }))
        })),
        suppliers: supData || [],
        sales: (sData || []).map((s: any) => ({ ...s, total: Number(s.total) || 0 })),
        profiles: prData || [],
        transfers: []
      });
      console.log("[fetchData] Success.");
    } catch (err: any) {
      console.error("[fetchData] Failed:", err);
      let message = err?.message || "Failed to connect to database";
      if (!isSupabaseConfigured) {
        message = "Configuration Missing: Please set your Supabase URL and Anon Key in Settings.";
      } else if (message === "Failed to fetch") {
        message = "Connection Error: Failed to fetch data. Verify Supabase availability.";
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

  const { branches, products, inventory, transactions, orders, supplyOrders, suppliers, sales, transfers, profiles } = data;

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

  const transferStock = async (sourceBranchId: string, destBranchId: string, productId: string, amount: number, notes: string = '') => {
    if (!user) return;
    try {
      await batchUpdateStocks([
        { branchId: sourceBranchId, productId, amount, type: 'remove', notes: `Transfer to ${destBranchId}: ${notes}` },
        { branchId: destBranchId, productId, amount, type: 'add', notes: `Transfer from ${sourceBranchId}: ${notes}` }
      ]);
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'inventory/transfer');
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
      let prof: any = null;
      let profError: any = null;
      
      const fetchResult = await supabase
        .from('profiles')
        .select('id, email, role, branch_id, is_verified')
        .eq('id', targetUser.id)
        .maybeSingle();
        
      if (fetchResult.error && (fetchResult.error.message?.includes('is_verified') || fetchResult.error.code?.includes('PGRST') || fetchResult.error.message?.includes('column'))) {
        const fallbackResult = await supabase
          .from('profiles')
          .select('id, email, role, branch_id')
          .eq('id', targetUser.id)
          .maybeSingle();
        if (!fallbackResult.error && fallbackResult.data) {
          prof = { ...fallbackResult.data, is_verified: true };
        } else {
          profError = fallbackResult.error;
        }
      } else {
        prof = fetchResult.data;
        profError = fetchResult.error;
      }

      if (profError) {
        console.error("[ensureProfile] Supabase Fetch Error:", profError.message);
      }

      if (prof) {
        console.log("[ensureProfile] Profile fetched successfully:", prof.role);
        setProfile(prof);
        return prof;
      }
      
      console.log("[ensureProfile] Profile not found, checking if we can create it...");
      
      // Double check if we are authenticated using local session or passed user
      const { data: { session } } = await supabase.auth.getSession();
      const authUser = session?.user || targetUser;
      if (!authUser || authUser.id !== targetUser.id) {
        console.error("[ensureProfile] Auth mismatch or no session. Cannot create profile.");
        return null;
      }

      console.log("[ensureProfile] Attempting to create missing profile...");
      let insertPayload: any = {
        id: targetUser.id,
        email: targetUser.email || authUser?.email || '',
        role: 'Cashier',
        is_verified: false
      };
      
      let { data: newProf, error: createError } = await supabase
        .from('profiles')
        .insert(insertPayload)
        .select()
        .maybeSingle() as any;

      if (createError && (createError.message?.includes('is_verified') || createError.message?.includes('column'))) {
        delete insertPayload.is_verified;
        const retryResult = await supabase
          .from('profiles')
          .insert(insertPayload)
          .select()
          .maybeSingle() as any;
        newProf = retryResult.data;
        createError = retryResult.error;
      }

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
      return null;
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

      // Warehouse role starts as In-Transit
      const isWarehouse = prof.role === 'Warehouse' || prof.role === 'Administrator' || prof.role === 'Manager';
      const initialStatus = isWarehouse ? 'In-Transit' : 'Pending';

      const insertPayload = {
        branch_id: branchId,
        items: items.map(item => ({ 
          productId: item.productId, 
          quantity: Number(item.quantity), 
          suppliedQuantity: Number(item.quantity) 
        })),
        status: initialStatus,
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
              message: `${isWarehouse ? 'Shipment' : 'Requisition'} initiated for ${bName}. ID: ${String(order.id).slice(0, 8)}`,
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
      return order;
    } catch (err: any) {
      console.error("[initiateOrder] FATAL:", err);
      setError(err?.message || "Order failed.");
      handleSupabaseError(err, OperationType.WRITE, 'orders/initiate');
      return null;
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

  const cancelOrder = async (orderId: string | number, reason: string = '') => {
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
        .update({ 
          status: 'Cancelled',
          notes: order.notes ? `${order.notes}\n[CANCELLED]: ${reason}` : `[CANCELLED]: ${reason}`,
          processed_at: new Date().toISOString(), // Using this as a generic update timestamp
          processed_by: user.id
        })
        .eq('id', orderId);
      if (error) throw error;

      // Log transactions for audit trail
      const transactionPayloads = (order.items && order.items.length > 0) 
        ? order.items.map((item: any) => ({
            branch_id: order.branch_id,
            product_id: item.productId,
            amount: 0,
            type: 'remove', 
            notes: `ORDER #${String(orderId).slice(0, 8)} ABORTED${reason ? `: ${reason}` : ''}`,
            user_id: user.id,
            timestamp: new Date().toISOString()
          }))
        : [{
            branch_id: order.branch_id,
            product_id: 'SYSTEM', // Fallback for order-level log without specific products
            amount: 0,
            type: 'remove',
            notes: `ORDER #${String(orderId).slice(0, 8)} ABORTED${reason ? `: ${reason}` : ''}`,
            user_id: user.id,
            timestamp: new Date().toISOString()
          }];

      await supabase.from('transactions').insert(transactionPayloads);

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

  const createSupplyOrder = async (orderData: {
    supplier_name: string,
    invoice_number: string,
    destination_branch_id: string,
    date_of_supply: string,
    items: any[],
    total_amount: number
  }) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('supply_orders')
        .insert({
          ...orderData,
          status: 'Created',
          created_by: user.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        if (error.code === 'PGRST205') {
          throw new Error("System Update in Progress: The supply_orders module is being provisioned. Please wait a few moments and try again.");
        }
        throw error;
      }
      await fetchData();
      return data;
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'supply_orders');
    }
  };

  const addSupplier = async (name: string, contact?: string, email?: string, phone?: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ name, contact_person: contact, email, phone })
        .select()
        .single();
      
      if (error) {
        if (error.code === 'PGRST205') {
          throw new Error("System Update in Progress: The suppliers module is being provisioned. Please wait a few moments and try again.");
        }
        throw error;
      }
      await fetchData();
      return data;
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'suppliers');
    }
  };

  const updateSupplyOrderStatus = async (orderId: string | number, status: 'In-Transit' | 'Cancelled') => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('supply_orders')
        .update({ status })
        .eq('id', orderId);
      
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'supply_orders/status');
    }
  };

  const confirmSupplyReceipt = async (orderId: string | number) => {
    if (!user) return;
    try {
      const { data: order, error: fetchError } = await supabase
        .from('supply_orders')
        .select('*')
        .eq('id', orderId)
        .single();
      
      if (fetchError || !order) throw fetchError || new Error('Supply order not found');
      if (order.status !== 'In-Transit') throw new Error('Invalid status for confirmation');

      // Update Inventory
      const updates = order.items.map((item: any) => ({
        branchId: order.destination_branch_id,
        productId: item.productId,
        amount: Number(item.quantity),
        type: 'add' as const,
        notes: `Supply Receipt: ${order.supplier_name} Inv#${order.invoice_number}`
      }));

      await batchUpdateStocks(updates);

      // Final Status Update
      const { error: updateError } = await supabase
        .from('supply_orders')
        .update({
          status: 'Received',
          received_at: new Date().toISOString(),
          received_by: user.id
        })
        .eq('id', orderId);

      if (updateError) throw updateError;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'supply_orders/confirm');
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

  const deleteProduct = async (id: string) => {
    if (!user) return;
    try {
      // First delete associated logs in transactions to avoid foreign key violations
      const { error: txError } = await supabase
        .from('transactions')
        .delete()
        .eq('product_id', id);
      if (txError) throw txError;

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'products');
    }
  };

  const updateUserProfile = async (id: string, updates: { role?: string; branch_id?: string | null; is_verified?: boolean }) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No rows were updated (RLS security policy restriction). Please ensure you are logged in as an Administrator and have permission to modify profiles.");
      }
      if (id === user.id) {
        setProfile(data[0]);
      }
      await fetchData();
    } catch (err: any) {
      handleSupabaseError(err, OperationType.UPDATE, 'profiles');
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

  const convertMercury = async (branchId: string, type: '1kg-to-500g' | '500g-to-16.5g' | '1kg-to-30g' = '1kg-to-30g') => {
    if (!user || !profile) return false;
    
    // Authorization check
    const allowedRoles = ['Supervisor', 'Manager', 'Administrator'];
    if (!allowedRoles.includes(profile.role)) {
      setError("Unauthorized: Only Supervisors and Admins can perform product conversions.");
      return false;
    }

    try {
      console.log(`[convertMercury] Starting conversion ${type} for branch: ${branchId}`);
      
      let sourceId = '';
      let targetId = '';
      let multiplier = 0;
      let notesText = '';

      if (type === '1kg-to-30g') {
        sourceId = '1kg-mercury';
        targetId = '30g-mercury';
        multiplier = 33;
        notesText = '1kg -> 33x30g';
      } else if (type === '1kg-to-500g') {
        sourceId = '1kg-mercury';
        targetId = '500g-mercury';
        multiplier = 2;
        notesText = '1kg -> 2x500g';
      } else if (type === '500g-to-16.5g') {
        sourceId = '500g-mercury';
        targetId = '16.5g-mercury';
        multiplier = 2;
        notesText = '500g -> 2x16.5g';
      }

      // 1. Verify we have enough source stock in this branch
      const { data: invData, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('branch_id', branchId)
        .in('product_id', [sourceId, targetId]);

      if (fetchError) throw fetchError;

      const sourceItem = invData?.find(i => i.product_id === sourceId);
      const targetItem = invData?.find(i => i.product_id === targetId);

      const sourceStock = Number(sourceItem?.stock || 0);
      const targetStock = Number(targetItem?.stock || 0);

      if (sourceStock < 1) {
        throw new Error(`Insufficient stock: ${sourceId} is not available in this branch.`);
      }

      // 2. Prepare Updates
      const timestamp = new Date().toISOString();
      const inventoryUpdates = [
        {
          branch_id: branchId,
          product_id: sourceId,
          stock: sourceStock - 1,
          last_updated: timestamp
        },
        {
          branch_id: branchId,
          product_id: targetId,
          stock: targetStock + multiplier,
          last_updated: timestamp
        }
      ];

      const transactionLogs = [
        {
          branch_id: branchId,
          product_id: sourceId,
          type: 'remove',
          amount: 1,
          timestamp,
          user_id: user.id,
          notes: `Mercury Conversion: ${notesText} (Approved by Supervisor)`
        },
        {
          branch_id: branchId,
          product_id: targetId,
          type: 'add',
          amount: multiplier,
          timestamp,
          user_id: user.id,
          notes: `Mercury Conversion: ${notesText} (Approved by Supervisor)`
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
    supplyOrders,
    suppliers,
    sales,
    transfers,
    profiles,
    updateStocks, 
    batchUpdateStocks,
    addProduct, 
    deleteProduct,
    addSupplier,
    addBranch,
    updateBranch,
    deleteBranch,
    updateThreshold,
    initiateOrder,
    processOrder,
    cancelOrder,
    confirmReceipt,
    createSupplyOrder,
    updateSupplyOrderStatus,
    confirmSupplyReceipt,
    processSale,
    updateProduct,
    updateUserProfile,
    convertMercury,
    transferStock,
    refreshData,
    error,
    loading,
    authLoading,
    user,
    profile,
    isRecovering,
    setIsRecovering
  };
}

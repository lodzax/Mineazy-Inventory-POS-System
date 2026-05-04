import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  doc, 
  serverTimestamp, 
  addDoc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function useInventory() {
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    // Subscribe to auth state
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // First, clean up any previous listeners
      unsubs.forEach(unsub => unsub());
      unsubs = [];

      if (!user) {
        setBranches([]);
        setProducts([]);
        setInventory([]);
        setTransactions([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const u1 = onSnapshot(collection(db, 'branches'), (snap) => {
          setBranches(snap.docs.map(d => d.data()));
        }, err => handleFirestoreError(err, OperationType.GET, 'branches'));

        const u2 = onSnapshot(collection(db, 'products'), (snap) => {
          setProducts(snap.docs.map(d => d.data()));
        }, err => handleFirestoreError(err, OperationType.GET, 'products'));

        const u3 = onSnapshot(collection(db, 'inventory'), (snap) => {
          setInventory(snap.docs.map(d => d.data()));
        }, err => handleFirestoreError(err, OperationType.GET, 'inventory'));

        const u4 = onSnapshot(collection(db, 'transactions'), (snap) => {
          setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        }, err => handleFirestoreError(err, OperationType.GET, 'transactions'));

        const u5 = onSnapshot(collection(db, 'orders'), (snap) => {
          setOrders(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        }, err => handleFirestoreError(err, OperationType.GET, 'orders'));

        const u6 = onSnapshot(collection(db, 'sales'), (snap) => {
          setSales(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        }, err => handleFirestoreError(err, OperationType.GET, 'sales'));

        const u7 = onSnapshot(collection(db, 'transfers'), (snap) => {
          setTransfers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        }, err => handleFirestoreError(err, OperationType.GET, 'transfers'));

        unsubs = [u1, u2, u3, u4, u5, u6, u7];
      } catch (err) {
        console.error("Failed to setup inventory listeners", err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  const updateStocks = async (branchId: string, productId: string, amount: number, type: 'add' | 'remove' | 'transfer', notes: string = '') => {
    if (!auth.currentUser) return;

    const invId = `${branchId}_${productId}`;
    const invRef = doc(db, 'inventory', invId);
    const currentSnap = await getDoc(invRef);
    const currentStock = currentSnap.exists() ? currentSnap.data().stock : 0;
    
    let newStock = currentStock;
    if (type === 'add') newStock += amount;
    if (type === 'remove') newStock -= amount;

    try {
      await setDoc(invRef, {
        branchId,
        productId,
        stock: newStock,
        lastUpdated: serverTimestamp()
      });

      await addDoc(collection(db, 'transactions'), {
        branchId,
        productId,
        type,
        amount,
        timestamp: serverTimestamp(),
        userId: auth.currentUser.uid,
        notes
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventory/transactions');
    }
  };

  const addProduct = async (name: string, unit: string, price: number, costPrice: number = 0) => {
    if (!auth.currentUser) return;
    const id = name.toLowerCase().replace(/\s+/g, '-');
    try {
      await setDoc(doc(db, 'products', id), { id, name, unit, price, costPrice });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products');
    }
  };

  const processSale = async (branchId: string, items: { productId: string, quantity: number, price: number }[], total: number, customerName: string = '', cashierName: string = '') => {
    if (!auth.currentUser) return;
    try {
      // 1. Create Sale Record
      const saleRef = await addDoc(collection(db, 'sales'), {
        branchId,
        items,
        total,
        customerName,
        cashierName,
        timestamp: serverTimestamp(),
        userId: auth.currentUser.uid
      });

      // 2. Update Stocks and log transactions
      for (const item of items) {
        await updateStocks(
          branchId,
          item.productId,
          item.quantity,
          'remove',
          `POS Sale #${saleRef.id.slice(0, 5)}`
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    }
  };

  const createOrder = async (branchId: string, items: { productId: string, quantity: number }[], notes: string = '') => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'orders'), {
        branchId,
        items,
        status: 'pending',
        createdAt: serverTimestamp(),
        notes,
        userId: auth.currentUser.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'orders');
    }
  };

  const dispatchOrder = async (orderId: string) => {
    if (!auth.currentUser) return;
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) return;

    const orderData = orderSnap.data();
    if (orderData.status !== 'pending') return;

    try {
      // Process each item in the order
      for (const item of orderData.items) {
        await updateStocks(
          orderData.branchId, 
          item.productId, 
          item.quantity, 
          'remove', 
          `Dispatched via Order #${orderId.slice(0, 5)}`
        );
      }

      await setDoc(orderRef, {
        ...orderData,
        status: 'dispatched',
        dispatchedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'orders/dispatch');
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await setDoc(doc(db, 'orders', orderId), { status: 'cancelled' }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'orders/cancel');
    }
  };

  const acknowledgeOrder = async (orderId: string) => {
    if (!auth.currentUser) return;
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) return;

    const orderData = orderSnap.data();
    if (orderData.status !== 'dispatched') return;

    try {
      // Add items TO the branch inventory
      for (const item of orderData.items) {
        await updateStocks(
          orderData.branchId, 
          item.productId, 
          item.quantity, 
          'add', 
          `Received via Order #${orderId.slice(0, 5)}`
        );
      }

      await setDoc(orderRef, {
        ...orderData,
        status: 'received',
        receivedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'orders/acknowledge');
    }
  };

  const updateProduct = async (id: string, updates: { price?: number, costPrice?: number, unit?: string, name?: string }) => {
    if (!auth.currentUser) return;
    try {
      await setDoc(doc(db, 'products', id), updates, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products');
    }
  };

  const transferStock = async (fromBranchId: string, toBranchId: string, items: { productId: string, quantity: number }[], notes: string = '') => {
    if (!auth.currentUser) return;
    try {
      // 1. Create Transfer Record
      const transferRef = await addDoc(collection(db, 'transfers'), {
        fromBranchId,
        toBranchId,
        items,
        notes,
        timestamp: serverTimestamp(),
        userId: auth.currentUser.uid
      });

      // 2. Process each item
      for (const item of items) {
        // Deduct from Source
        await updateStocks(
          fromBranchId,
          item.productId,
          item.quantity,
          'remove',
          `Transfer #${transferRef.id.slice(0, 5)} to branch ${toBranchId}`
        );

        // Add to Destination
        await updateStocks(
          toBranchId,
          item.productId,
          item.quantity,
          'add',
          `Received via Transfer #${transferRef.id.slice(0, 5)} from branch ${fromBranchId}`
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'transfers');
    }
  };

  const addBranch = async (name: string, location: string = '') => {
    if (!auth.currentUser) return;
    const id = name.toLowerCase().replace(/\s+/g, '-');
    try {
      await setDoc(doc(db, 'branches', id), { id, name, location });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'branches');
    }
  };

  const updateBranch = async (id: string, updates: { name?: string, location?: string }) => {
    if (!auth.currentUser) return;
    try {
      await setDoc(doc(db, 'branches', id), updates, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'branches');
    }
  };

  const deleteBranch = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'branches', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'branches');
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
    loading 
  };
}

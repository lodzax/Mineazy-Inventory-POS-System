import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Package, 
  MapPin, 
  Activity, 
  Calendar, 
  Filter, 
  FileDown, 
  Printer, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Building2, 
  Grid, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  Download,
  AlertTriangle,
  ArrowRightLeft
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';

const PRODUCT_COLORS = [
  '#18181B', // Zinc-900 (primary style)
  '#2563EB', // Blue-600
  '#16A34A', // Green-600
  '#D97706', // Amber-600
  '#7C3AED', // Purple-600
  '#E11D48', // Rose-600
  '#0891B2', // Cyan-600
  '#EA580C', // Orange-600
  '#0D9488', // Teal-600
  '#DB2777', // Pink-600
  '#4F46E5', // Indigo-600
  '#CA8A04', // Yellow-600
];

const getProductColor = (index: number) => {
  return PRODUCT_COLORS[index % PRODUCT_COLORS.length];
};

interface InventoryHistoryViewProps {
  transactions: any[];
  inventory: any[];
  branches: any[];
  products: any[];
  profile: any;
}

export default function InventoryHistoryView({ 
  transactions, 
  inventory, 
  branches, 
  products, 
  profile 
}: InventoryHistoryViewProps) {
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [period, setPeriod] = useState<string>('30');
  
  // Custom date states (used when period === 'custom')
  const [customStartDate, setCustomStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [breakdownTab, setBreakdownTab] = useState<'products' | 'branches'>('products');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  const isAdmin = profile?.role === 'Administrator' || profile?.role === 'Manager' || profile?.role === 'Warehouse';
  const userBranchId = profile?.branch_id;

  // Enforce branch boundaries for supervisor / cashier roles
  const activeBranchFilter = useMemo(() => {
    if (!isAdmin && userBranchId) {
      return userBranchId.toLowerCase();
    }
    return filterBranch.toLowerCase();
  }, [isAdmin, userBranchId, filterBranch]);

  // Determine period boundaries
  const dateRange = useMemo(() => {
    let startStr = '';
    let endStr = new Date().toISOString().split('T')[0];

    const today = new Date();
    if (period === '7') {
      const past = new Date();
      past.setDate(today.getDate() - 6);
      startStr = past.toISOString().split('T')[0];
    } else if (period === '30') {
      const past = new Date();
      past.setDate(today.getDate() - 29);
      startStr = past.toISOString().split('T')[0];
    } else if (period === '90') {
      const past = new Date();
      past.setDate(today.getDate() - 89);
      startStr = past.toISOString().split('T')[0];
    } else if (period === 'all') {
      if (transactions.length > 0) {
        const sortedTimestamps = [...transactions]
          .map(tx => tx.timestamp)
          .filter(Boolean)
          .sort();
        if (sortedTimestamps.length > 0) {
          startStr = sortedTimestamps[0].split('T')[0];
        } else {
          startStr = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }
      } else {
        startStr = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }
    } else {
      // Custom
      startStr = customStartDate;
      endStr = customEndDate;
    }

    // Generate daily date array
    const dates: string[] = [];
    const startDateObj = new Date(startStr);
    const endDateObj = new Date(endStr);
    
    if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
      const current = new Date(startDateObj);
      // Cap maximum date range to 180 days to avoid UI and performance bottlenecks
      let iterations = 0;
      while (current <= endDateObj && iterations < 180) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
        iterations++;
      }
    }
    return { startDate: startStr, endDate: endStr, dates };
  }, [period, customStartDate, customEndDate, transactions]);

  // Filter transactions matching active branch, product, and period boundaries
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Branch check
      if (activeBranchFilter !== 'all' && tx.branch_id?.toLowerCase() !== activeBranchFilter) {
        return false;
      }
      // Product check
      if (filterProduct !== 'all' && tx.product_id?.toLowerCase() !== filterProduct.toLowerCase()) {
        return false;
      }
      // Period check
      if (tx.timestamp) {
        const txDate = tx.timestamp.split('T')[0];
        if (txDate < dateRange.startDate || txDate > dateRange.endDate) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, activeBranchFilter, filterProduct, dateRange]);

  // Current filtered stocks (matching selected filters right now)
  const filteredCurrentStocks = useMemo(() => {
    return inventory.filter(item => {
      const bMatches = activeBranchFilter === 'all' || item.branch_id?.toLowerCase() === activeBranchFilter;
      const pMatches = filterProduct === 'all' || item.product_id?.toLowerCase() === filterProduct.toLowerCase();
      return bMatches && pMatches;
    });
  }, [inventory, activeBranchFilter, filterProduct]);

  // List of products that we are currently tracking/filtering
  const trackedProducts = useMemo(() => {
    return products.filter(p => 
      filterProduct === 'all' || p.id?.toLowerCase() === filterProduct.toLowerCase()
    );
  }, [products, filterProduct]);

  // Reconstruct daily historical closing stock per product/artifact
  const timelineData = useMemo(() => {
    const { dates, startDate } = dateRange;
    if (dates.length === 0) return [];

    // Prepare running state and transactions for each tracked product
    const productStates = trackedProducts.map(prod => {
      // Current inventory for this product matching active branch filter
      const currentProductStocks = inventory.filter(item => 
        item.product_id?.toLowerCase() === prod.id?.toLowerCase() &&
        (activeBranchFilter === 'all' || item.branch_id?.toLowerCase() === activeBranchFilter)
      );
      const currentStock = currentProductStocks.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);

      // Filter transactions occurring from startDate till now for this product to reverse
      const txsForReverse = transactions.filter(tx => {
        if (activeBranchFilter !== 'all' && tx.branch_id?.toLowerCase() !== activeBranchFilter) {
          return false;
        }
        if (tx.product_id?.toLowerCase() !== prod.id?.toLowerCase()) {
          return false;
        }
        if (!tx.timestamp) return false;
        return tx.timestamp.split('T')[0] >= startDate;
      });

      // Walk backward to start of period
      let initialStock = currentStock;
      txsForReverse.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        if (tx.type === 'add') {
          initialStock -= amt;
        } else if (tx.type === 'remove' || tx.type === 'subtract' || tx.type === 'sale') {
          initialStock += amt;
        }
      });

      // Index transactions by day
      const txsByDay: Record<string, any[]> = {};
      txsForReverse.forEach(tx => {
        const day = tx.timestamp.split('T')[0];
        if (!txsByDay[day]) txsByDay[day] = [];
        txsByDay[day].push(tx);
      });

      return {
        product: prod,
        runningStock: initialStock,
        txsByDay
      };
    });

    const chartPoints: any[] = [];

    dates.forEach(day => {
      const dayName = new Date(day).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const point: any = {
        date: day,
        name: dayName,
        totalStock: 0,
        added: 0,
        removed: 0
      };

      productStates.forEach(state => {
        const dayTxs = state.txsByDay[day] || [];
        let addedVal = 0;
        let removedVal = 0;

        dayTxs.forEach(tx => {
          const amt = Number(tx.amount) || 0;
          if (tx.type === 'add') {
            state.runningStock += amt;
            addedVal += amt;
          } else if (tx.type === 'remove' || tx.type === 'subtract' || tx.type === 'sale') {
            state.runningStock -= amt;
            removedVal += amt;
          }
        });

        // Clamp stock to non-negative
        state.runningStock = Math.max(0, state.runningStock);

        // Store specific product data
        point[state.product.id] = state.runningStock;
        point[`${state.product.id}_added`] = addedVal;
        point[`${state.product.id}_removed`] = removedVal;

        point.totalStock += state.runningStock;
        point.added += addedVal;
        point.removed += removedVal;
      });

      point.stock = point.totalStock; // compatibility with aggregate stats/graphs
      point.netFlow = point.added - point.removed;

      chartPoints.push(point);
    });

    return chartPoints;
  }, [dateRange, transactions, inventory, activeBranchFilter, trackedProducts]);

  // Computes statistics and statistical insights from the active filtered context
  const stats = useMemo(() => {
    const totalTransactions = filteredTransactions.length;
    const currentStockLevel = filteredCurrentStocks.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
    
    let totalAdded = 0;
    let totalRemoved = 0;

    filteredTransactions.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'add') {
        totalAdded += amt;
      } else {
        totalRemoved += amt;
      }
    });

    const timelineStocks = timelineData.map(t => t.stock);
    const peakStock = timelineStocks.length > 0 ? Math.max(...timelineStocks) : currentStockLevel;
    const lowestStock = timelineStocks.length > 0 ? Math.min(...timelineStocks) : currentStockLevel;
    const averageStock = timelineStocks.length > 0 
      ? Math.round(timelineStocks.reduce((a, b) => a + b, 0) / timelineStocks.length)
      : currentStockLevel;

    // Identify low stock and out of stock items currently
    let lowStockAlerts = 0;
    let outOfStockAlerts = 0;

    filteredCurrentStocks.forEach(item => {
      const stockVal = Number(item.stock) || 0;
      const thresh = Number(item.low_stock_threshold) || 0;
      if (stockVal === 0) {
        outOfStockAlerts++;
      } else if (stockVal <= thresh) {
        lowStockAlerts++;
      }
    });

    // Statistical Insights text formulas
    let peakAdjustmentDay = 'N/A';
    let maxAdjustmentAmt = 0;
    
    timelineData.forEach(pt => {
      const dayMovement = pt.added + pt.removed;
      if (dayMovement > maxAdjustmentAmt) {
        maxAdjustmentAmt = dayMovement;
        peakAdjustmentDay = pt.date;
      }
    });

    // Most active product
    const prodActivityMap: Record<string, number> = {};
    filteredTransactions.forEach(tx => {
      const pid = tx.product_id;
      if (pid) {
        prodActivityMap[pid] = (prodActivityMap[pid] || 0) + (Number(tx.amount) || 0);
      }
    });

    let topProductByVolume = 'None';
    let maxProdVolume = 0;
    Object.entries(prodActivityMap).forEach(([pid, vol]) => {
      if (vol > maxProdVolume) {
        maxProdVolume = vol;
        topProductByVolume = products.find(p => p.id === pid)?.name || pid;
      }
    });

    return {
      totalTransactions,
      currentStockLevel,
      totalAdded,
      totalRemoved,
      netFlow: totalAdded - totalRemoved,
      peakStock,
      lowestStock,
      averageStock,
      lowStockAlerts,
      outOfStockAlerts,
      peakAdjustmentDay: peakAdjustmentDay !== 'N/A' 
        ? new Date(peakAdjustmentDay).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : 'None',
      topProductByVolume,
      volatilityRate: totalTransactions > 0 ? Math.round(((totalAdded + totalRemoved) / (currentStockLevel || 1)) * 100) : 0
    };
  }, [filteredTransactions, filteredCurrentStocks, timelineData, products]);

  // Breakdown matrix items
  const breakdownMatrix = useMemo(() => {
    if (breakdownTab === 'products') {
      return products.map(prod => {
        // Find current stock for this product across filtered branches
        const productStocks = inventory.filter(inv => {
          const isProd = inv.product_id?.toLowerCase() === prod.id?.toLowerCase();
          const isBranch = activeBranchFilter === 'all' || inv.branch_id?.toLowerCase() === activeBranchFilter;
          return isProd && isBranch;
        });

        const closingStock = productStocks.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
        const thresholdSum = productStocks.reduce((sum, item) => sum + (Number(item.low_stock_threshold) || 0), 0);

        // Calculate additions/removals in selected period
        let added = 0;
        let removed = 0;

        filteredTransactions.forEach(tx => {
          if (tx.product_id?.toLowerCase() === prod.id?.toLowerCase()) {
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'add') added += amt;
            else removed += amt;
          }
        });

        const startingStock = Math.max(0, closingStock - added + removed);

        // Status determination
        let status: 'Optimal' | 'Low Stock' | 'Out of Stock' = 'Optimal';
        if (closingStock === 0) {
          status = 'Out of Stock';
        } else if (closingStock <= (thresholdSum || 5)) {
          status = 'Low Stock';
        }

        return {
          id: prod.id,
          name: prod.name,
          category: prod.category || 'General',
          startingStock,
          added,
          removed,
          netFlow: added - removed,
          closingStock,
          status
        };
      }).filter(item => {
        if (!searchQuery) return true;
        return item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
               item.category.toLowerCase().includes(searchQuery.toLowerCase());
      });
    } else {
      // By branch
      const activeBranches = activeBranchFilter === 'all' 
        ? branches 
        : branches.filter(b => b.id?.toLowerCase() === activeBranchFilter);

      return activeBranches.map(br => {
        // Find current stock in this branch for filtered product
        const branchStocks = inventory.filter(inv => {
          const isBranch = inv.branch_id?.toLowerCase() === br.id?.toLowerCase();
          const isProd = filterProduct === 'all' || inv.product_id?.toLowerCase() === filterProduct.toLowerCase();
          return isBranch && isProd;
        });

        const closingStock = branchStocks.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
        const thresholdSum = branchStocks.reduce((sum, item) => sum + (Number(item.low_stock_threshold) || 0), 0);

        // Calculate additions/removals in selected period
        let added = 0;
        let removed = 0;

        filteredTransactions.forEach(tx => {
          if (tx.branch_id?.toLowerCase() === br.id?.toLowerCase()) {
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'add') added += amt;
            else removed += amt;
          }
        });

        const startingStock = Math.max(0, closingStock - added + removed);

        let status: 'Optimal' | 'Low Stock' | 'Out of Stock' = 'Optimal';
        if (closingStock === 0) {
          status = 'Out of Stock';
        } else if (closingStock <= (thresholdSum || 10)) {
          status = 'Low Stock';
        }

        return {
          id: br.id,
          name: br.name,
          category: br.location || 'Branch Node',
          startingStock,
          added,
          removed,
          netFlow: added - removed,
          closingStock,
          status
        };
      }).filter(item => {
        if (!searchQuery) return true;
        return item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
               item.category.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }
  }, [breakdownTab, products, branches, inventory, activeBranchFilter, filterProduct, filteredTransactions, searchQuery]);

  // Paginated raw transaction logs matching filters for high traceability
  const rawLogsSorted = useMemo(() => {
    return [...filteredTransactions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [filteredTransactions]);

  const totalPages = Math.ceil(rawLogsSorted.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    return rawLogsSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [rawLogsSorted, currentPage]);

  // Export PDF Report function
  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('INVENTORY HISTORY & MOVEMENT MATRIX', 105, 20, { align: 'center' });
    
    // Sub-header info
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 27, { align: 'center' });
    
    let activeFilters = `Period: ${dateRange.startDate} to ${dateRange.endDate} | `;
    if (activeBranchFilter !== 'all') {
      activeFilters += `Branch: ${branches.find(b => b.id?.toLowerCase() === activeBranchFilter)?.name || activeBranchFilter} | `;
    } else {
      activeFilters += 'Branch: All Branches | ';
    }
    if (filterProduct !== 'all') {
      activeFilters += `Product: ${products.find(p => p.id?.toLowerCase() === filterProduct.toLowerCase())?.name || filterProduct}`;
    } else {
      activeFilters += 'Product: All Products';
    }
    doc.text(activeFilters, 105, 33, { align: 'center' });

    // Core Metrics Table
    autoTable(doc, {
      startY: 40,
      head: [['Metric Parameter', 'Value Description']],
      body: [
        ['Closing Stock Level', `${stats.currentStockLevel} total units`],
        ['Total Periodic Additions', `+${stats.totalAdded} units`],
        ['Total Periodic Subtractions', `-${stats.totalRemoved} units`],
        ['Net Material Flow', `${stats.netFlow >= 0 ? '+' : ''}${stats.netFlow} units`],
        ['Average Registered Stock', `${stats.averageStock} units`],
        ['Volatility Intensity', `${stats.volatilityRate}% relative flux`],
        ['Peak Demand Day', stats.peakAdjustmentDay],
        ['Highest Activity Resource', stats.topProductByVolume]
      ],
      theme: 'striped',
      headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
      styles: { fontSize: 8.5 }
    });

    // Breakdown Matrix Table
    const tableHeaders = breakdownTab === 'products' 
      ? ['Product Name', 'Category', 'Start Stock', 'Added (+)', 'Removed (-)', 'Net Flow', 'Closing Stock', 'Health State']
      : ['Branch Name', 'Location', 'Start Stock', 'Added (+)', 'Removed (-)', 'Net Flow', 'Closing Stock', 'Health State'];

    const tableRows = breakdownMatrix.map(item => [
      item.name,
      item.category,
      item.startingStock.toString(),
      `+${item.added}`,
      `-${item.removed}`,
      `${item.netFlow >= 0 ? '+' : ''}${item.netFlow}`,
      item.closingStock.toString(),
      item.status
    ]);

    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text(`Analytical Breakdown Matrix (by ${breakdownTab === 'products' ? 'Product' : 'Branch'})`, 14, 20);

    autoTable(doc, {
      startY: 25,
      head: [tableHeaders],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [43, 58, 85], textColor: [255, 255, 255] },
      styles: { fontSize: 8 }
    });

    doc.save(`inventory_analytics_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* Upper Interactive Refinement Rail */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5 no-print" id="filters_card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Filter className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-serif font-semibold text-ink">Analytical Parameters</h3>
              <p className="text-xs text-ink/40 font-mono">Refine stock levels and transactional sequences</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:flex lg:items-center gap-4 flex-1 lg:justify-end">
            {/* Branch Selector (Admins Only) */}
            {isAdmin ? (
              <div className="space-y-1.5 min-w-[180px]">
                <label className="block text-[10px] font-mono uppercase text-ink/40 font-black tracking-widest ml-1">Branch Node</label>
                <div className="relative">
                  <select 
                    id="branch_filter_select"
                    value={filterBranch}
                    onChange={(e) => { setFilterBranch(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-10 pr-6 py-2.5 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
                  >
                    <option value="all">All Branches</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 min-w-[180px]">
                <label className="block text-[10px] font-mono uppercase text-ink/40 font-black tracking-widest ml-1">Branch Node</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-background border border-ink/5 rounded-xl text-xs font-mono font-bold text-ink/60">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span>{branches.find(b => b.id?.toLowerCase() === userBranchId?.toLowerCase())?.name || 'Local Branch'}</span>
                </div>
              </div>
            )}

            {/* Product Selector (Artifact) */}
            <div className="space-y-1.5 min-w-[180px]">
              <label className="block text-[10px] font-mono uppercase text-ink/40 font-black tracking-widest ml-1">Artifact (SKU)</label>
              <div className="relative">
                <select 
                  id="artifact_filter_select"
                  value={filterProduct}
                  onChange={(e) => { setFilterProduct(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-6 py-2.5 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
                >
                  <option value="all">All Artifacts</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </select>
                <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
              </div>
            </div>

            {/* Time Period Selector */}
            <div className="space-y-1.5 min-w-[150px]">
              <label className="block text-[10px] font-mono uppercase text-ink/40 font-black tracking-widest ml-1">Time Period</label>
              <div className="relative">
                <select 
                  id="period_filter_select"
                  value={period}
                  onChange={(e) => { setPeriod(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-6 py-2.5 bg-background border border-ink/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs appearance-none"
                >
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                  <option value="all">All Time</option>
                  <option value="custom">Custom Range</option>
                </select>
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
              </div>
            </div>
          </div>
        </div>

        {/* Custom Date Inputs container */}
        <AnimatePresence>
          {period === 'custom' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-4 pt-4 border-t border-ink/5 flex flex-col md:flex-row items-center gap-4"
              id="custom_dates_drawer"
            >
              <div className="w-full md:w-auto space-y-1">
                <span className="block text-[9px] font-mono uppercase text-ink/30 font-bold ml-1">Start Boundary</span>
                <input 
                  type="date"
                  value={customStartDate}
                  onChange={(e) => { setCustomStartDate(e.target.value); setCurrentPage(1); }}
                  className="w-full px-4 py-2 bg-background border border-ink/5 rounded-xl text-xs font-mono focus:outline-none"
                />
              </div>
              <div className="w-full md:w-auto space-y-1">
                <span className="block text-[9px] font-mono uppercase text-ink/30 font-bold ml-1">End Boundary</span>
                <input 
                  type="date"
                  value={customEndDate}
                  onChange={(e) => { setCustomEndDate(e.target.value); setCurrentPage(1); }}
                  className="w-full px-4 py-2 bg-background border border-ink/5 rounded-xl text-xs font-mono focus:outline-none"
                />
              </div>
              <div className="flex-1 text-right mt-4 md:mt-0">
                <span className="text-[10px] font-mono text-ink/40">
                  Range: <strong className="text-ink font-bold">{dateRange.dates.length} days</strong> compiled
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Aggregate Metric Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6" id="metrics_matrix">
        {/* Card 1: Closing Stock */}
        <div className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col justify-between" id="metric_closing_stock">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Closing Stock</span>
            <div className="w-8 h-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="block text-2xl font-serif font-bold text-ink tracking-tight">{stats.currentStockLevel}</span>
            <span className="block text-[10px] font-mono text-ink/40 mt-1 uppercase">Active Filtered Units</span>
          </div>
        </div>

        {/* Card 2: Material Flows */}
        <div className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col justify-between" id="metric_material_flows">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Periodic Flow</span>
            <div className="flex gap-1">
              <span className="text-emerald-500 font-bold text-xs">+{stats.totalAdded}</span>
              <span className="text-rose-500 font-bold text-xs">-{stats.totalRemoved}</span>
            </div>
          </div>
          <div>
            <span className={`block text-2xl font-serif font-bold tracking-tight ${stats.netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {stats.netFlow >= 0 ? '+' : ''}{stats.netFlow}
            </span>
            <span className="block text-[10px] font-mono text-ink/40 mt-1 uppercase">Net periodic change</span>
          </div>
        </div>

        {/* Card 3: Periodic Average */}
        <div className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col justify-between" id="metric_average_stock">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Avg Buffer</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/5 flex items-center justify-center text-amber-500">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="block text-2xl font-serif font-bold text-ink tracking-tight">{stats.averageStock}</span>
            <span className="block text-[10px] font-mono text-ink/40 mt-1 uppercase">Mean level in window</span>
          </div>
        </div>

        {/* Card 4: Healthy Ratio */}
        <div className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col justify-between" id="metric_stock_health">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-ink/30">Nodes Alert</span>
            <div className="flex gap-1.5 items-center">
              {stats.outOfStockAlerts > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              )}
              {stats.lowStockAlerts > 0 && stats.outOfStockAlerts === 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {(stats.lowStockAlerts === 0 && stats.outOfStockAlerts === 0) && (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              )}
            </div>
          </div>
          <div>
            <span className="block text-2xl font-serif font-bold text-ink tracking-tight">
              {stats.outOfStockAlerts} <span className="text-xs font-mono font-black text-red-500">OOS</span> / {stats.lowStockAlerts} <span className="text-xs font-mono font-black text-amber-500">LOW</span>
            </span>
            <span className="block text-[10px] font-mono text-ink/40 mt-1 uppercase">Active Alert Statuses</span>
          </div>
        </div>
      </div>

      {/* Main Graph Panel */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5" id="charts_panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-serif font-bold text-ink">Material Levels Timeline</h3>
            <p className="text-xs text-ink/40 font-mono">Historical stock curves play forward</p>
          </div>
          <div className="flex items-center gap-2 bg-background p-1 rounded-xl self-start md:self-auto">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white shadow-sm border border-ink/5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-ink/70">Level Over Time</span>
            </div>
          </div>
        </div>

        {timelineData.length > 0 ? (
          <div className="h-[320px] w-full" id="stock_curve_chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={timelineData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  {trackedProducts.map((prod, idx) => {
                    const color = getProductColor(idx);
                    return (
                      <linearGradient key={`grad-${prod.id}`} id={`color-${prod.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.12}/>
                        <stop offset="95%" stopColor={color} stopOpacity={0.0}/>
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#18181b08" />
                <XAxis 
                  dataKey="name" 
                  stroke="#18181b40" 
                  fontSize={9} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                />
                <YAxis 
                  stroke="#18181b40" 
                  fontSize={9} 
                  tickLine={false} 
                  axisLine={false} 
                  dx={-10}
                />
                <Tooltip 
                  content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-zinc-900/95 text-white p-4 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md font-mono text-[10px] min-w-[200px] max-w-xs md:max-w-md">
                          <p className="font-bold text-white/50 mb-2 border-b border-white/10 pb-1 flex justify-between">
                            <span>{new Date(data.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span className="text-emerald-400">Net: {data.netFlow >= 0 ? '+' : ''}{data.netFlow}</span>
                          </p>
                          <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                            {trackedProducts.map((prod, idx) => {
                              const color = getProductColor(idx);
                              const stockVal = data[prod.id] ?? 0;
                              const addedVal = data[`${prod.id}_added`] ?? 0;
                              const removedVal = data[`${prod.id}_removed`] ?? 0;
                              return (
                                <div key={prod.id} className="flex flex-col gap-0.5 border-b border-white/5 pb-1 last:border-0 last:pb-0">
                                  <div className="flex justify-between items-center gap-4">
                                    <span className="flex items-center gap-1.5 font-bold truncate max-w-[120px]" style={{ color }}>
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                      {prod.name}
                                    </span>
                                    <span className="font-bold text-zinc-100">{stockVal} {prod.unit || 'units'}</span>
                                  </div>
                                  {(addedVal > 0 || removedVal > 0) && (
                                    <div className="flex gap-2 text-[9px] text-white/40 pl-3">
                                      {addedVal > 0 && <span className="text-emerald-400">+{addedVal}</span>}
                                      {removedVal > 0 && <span className="text-red-400">-{removedVal}</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-2 pt-2 border-t border-white/10 flex justify-between font-bold text-white text-xs">
                            <span>TOTAL STOCK:</span>
                            <span>{data.stock} units</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  height={44} 
                  content={({ payload }: any) => {
                    return (
                      <div className="flex flex-wrap gap-x-4 gap-y-2 pb-4 text-[10px] font-mono uppercase tracking-wider text-ink/60">
                        {payload.map((entry: any, index: number) => (
                          <div key={`item-${index}`} className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="font-bold">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {trackedProducts.map((prod, idx) => {
                  const color = getProductColor(idx);
                  return (
                    <Area 
                      key={prod.id}
                      type="monotone" 
                      dataKey={prod.id} 
                      stroke={color} 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill={`url(#color-${prod.id})`} 
                      name={prod.name}
                      activeDot={{ r: 5 }}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[320px] flex flex-col items-center justify-center border-2 border-dashed border-ink/5 rounded-3xl opacity-40">
            <Activity className="w-8 h-8 mb-2 animate-pulse text-ink/30" />
            <p className="font-mono text-xs uppercase tracking-widest">Insufficient data to compile stock curve</p>
          </div>
        )}
      </div>

      {/* Breakdown Matrix Matrix & Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Breakdown Matrix Panel */}
        <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col justify-between" id="breakdown_matrix">
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-serif font-bold text-ink">Breakdown Matrix</h3>
                <p className="text-xs text-ink/40 font-mono font-medium">Flux matrix per unique artifact node</p>
              </div>

              {/* Toggle with tabs */}
              <div className="flex items-center gap-1 bg-background p-1 rounded-xl self-start md:self-auto">
                <button 
                  onClick={() => { setBreakdownTab('products'); setSearchQuery(''); }}
                  className={`px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all ${
                    breakdownTab === 'products' ? 'bg-white text-ink shadow-sm' : 'text-ink/40 hover:text-ink'
                  }`}
                  id="breakdown_by_products_tab"
                >
                  By Artifact
                </button>
                <button 
                  onClick={() => { setBreakdownTab('branches'); setSearchQuery(''); }}
                  className={`px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all ${
                    breakdownTab === 'branches' ? 'bg-white text-ink shadow-sm' : 'text-ink/40 hover:text-ink'
                  }`}
                  id="breakdown_by_branches_tab"
                >
                  By Branch Node
                </button>
              </div>
            </div>

            {/* Quick search filter in matrix */}
            <div className="relative">
              <input 
                type="text"
                placeholder={`Search rows by ${breakdownTab === 'products' ? 'artifact' : 'node'} name...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-ink/5 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                id="matrix_search_input"
              />
              <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
            </div>

            {/* Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-ink/5 bg-background font-mono text-[9px] uppercase text-ink/40 font-black tracking-widest">
                    <th className="px-4 py-3">{breakdownTab === 'products' ? 'Artifact' : 'Branch Node'}</th>
                    <th className="px-4 py-3 text-right">Start Stock</th>
                    <th className="px-4 py-3 text-right text-emerald-600">Added</th>
                    <th className="px-4 py-3 text-right text-rose-500">Removed</th>
                    <th className="px-4 py-3 text-right">Net Flux</th>
                    <th className="px-4 py-3 text-right">Closing</th>
                    <th className="px-4 py-3 text-right">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/[0.03]">
                  {breakdownMatrix.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`} className="text-xs hover:bg-background/40 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-ink/80">{item.name}</span>
                          <span className="text-[10px] text-ink/30 font-mono">{item.category}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink/60">{item.startingStock}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">+{item.added}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-500">-{item.removed}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${item.netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {item.netFlow >= 0 ? '+' : ''}{item.netFlow}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-ink">{item.closingStock}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                          item.status === 'Optimal' ? 'bg-emerald-500/10 text-emerald-600' :
                          item.status === 'Low Stock' ? 'bg-amber-500/10 text-amber-600' :
                          'bg-red-500/10 text-red-600'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {breakdownMatrix.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-ink/30 font-serif italic">
                        No parameters found in current filter context
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Statistical Insights Panel */}
        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/5 flex flex-col justify-between" id="insights_panel">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-serif font-bold text-ink">Statistical Insights</h3>
            </div>

            <div className="space-y-5">
              {/* Peak volatility adjustment block */}
              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-1">
                <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-primary">Peak Volatility Date</span>
                <p className="text-xs text-ink/70 leading-relaxed font-medium">
                  {stats.peakAdjustmentDay !== 'None' ? (
                    <>
                      On <strong className="text-ink font-semibold">{stats.peakAdjustmentDay}</strong>, the system logged its highest periodic flux with a total of <strong className="text-ink font-bold">{stats.totalTransactions > 0 ? 'adjustments' : ''}</strong>.
                    </>
                  ) : (
                    "No material stock adjustments logged during this period."
                  )}
                </p>
              </div>

              {/* High intensity resource block */}
              <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 space-y-1">
                <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-purple-600">Active Material Driver</span>
                <p className="text-xs text-ink/70 leading-relaxed font-medium">
                  {stats.topProductByVolume !== 'None' ? (
                    <>
                      Highest demand stress is centered on <strong className="text-ink font-semibold">{stats.topProductByVolume}</strong>. This product is responsible for the greatest quantity of flow across filtered nodes.
                    </>
                  ) : (
                    "Material demand distributions remain balanced or flat in active parameters."
                  )}
                </p>
              </div>

              {/* Ratio warning block */}
              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 space-y-1">
                <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-amber-600">Depletion Risk Alert</span>
                <p className="text-xs text-ink/70 leading-relaxed font-medium">
                  Currently, <strong className="text-ink font-bold">{stats.outOfStockAlerts} items</strong> are depleted and <strong className="text-ink font-bold">{stats.lowStockAlerts} items</strong> have reached threshold boundaries in the selected nodes.
                </p>
              </div>

              {/* Stability score index */}
              <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 space-y-1">
                <span className="block text-[10px] font-mono font-black uppercase tracking-widest text-emerald-600">Friction Volatility Index</span>
                <p className="text-xs text-ink/70 leading-relaxed font-medium">
                  The active nodes exhibit a stock volatility rate of <strong className="text-ink font-bold">{stats.volatilityRate}%</strong> relative to current inventories, signaling {stats.volatilityRate > 50 ? 'rapid stock turnover requiring high buffer levels' : 'stable material flow limits'}.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Raw Traceability Logs */}
      <div className="bg-white rounded-[2.5rem] border border-ink/5 overflow-hidden shadow-xl shadow-ink/5" id="traceability_logs_card">
        <div className="p-6 md:p-8 border-b border-ink/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif font-bold text-ink">Material Traceability Logs</h3>
            <p className="text-xs text-ink/40 font-mono">Auditable chronological ledger of every stock transaction</p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button 
              id="export_pdf_button"
              onClick={exportToPDF}
              className="px-6 py-3 bg-zinc-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:translate-y-[-1px] transition-all cursor-pointer active:scale-95"
            >
              <FileDown className="w-4 h-4" />
              <span>Export PDF Report</span>
            </button>
            <button 
              id="print_audit_button"
              onClick={() => { window.focus(); window.print(); }}
              className="px-6 py-3 bg-background border border-ink/5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:translate-y-[-1px] transition-all cursor-pointer active:scale-95 text-ink/70"
            >
              <Printer className="w-4 h-4" />
              <span>Print Audit</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink/5 bg-background font-mono text-[9px] uppercase text-ink/40 font-black tracking-widest">
                <th className="px-8 py-5">Time Stamp</th>
                <th className="px-8 py-5">Operation</th>
                <th className="px-8 py-5">Node</th>
                <th className="px-8 py-5">Resource</th>
                <th className="px-8 py-5">Description</th>
                <th className="px-8 py-5 text-right">Magnitude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.03]">
              {paginatedLogs.map((tx, idx) => {
                const branch = branches.find(b => b.id?.toLowerCase() === tx.branch_id?.toLowerCase());
                const product = products.find(p => p.id?.toLowerCase() === tx.product_id?.toLowerCase());
                return (
                  <tr key={`${tx.id || 'tx'}-${idx}`} className="text-xs hover:bg-background/40 transition-colors group">
                    <td className="px-8 py-4">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-ink/60">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                        <span className="text-[10px] text-ink/30 font-mono">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase ${
                        tx.type === 'add' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                      }`}>
                        {tx.type === 'add' ? 'ADDITION' : 'REMOVAL'}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                        <span className="font-bold text-ink/70">{branch?.name || tx.branch_id}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 font-semibold text-ink/80">{product?.name || tx.product_id}</td>
                    <td className="px-8 py-4 text-ink/40 italic font-medium max-w-xs truncate" title={tx.notes}>
                      {tx.notes || '-'}
                    </td>
                    <td className={`px-8 py-4 text-right font-mono font-bold text-sm ${
                      tx.type === 'add' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {tx.type === 'add' ? '+' : '-'}{tx.amount}
                    </td>
                  </tr>
                );
              })}
              {rawLogsSorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-16 text-center text-ink/30 font-serif italic text-sm">
                    No transactions recorded matching current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-8 py-4 bg-background/5 border-t border-ink/5" id="pagination_controls">
            <p className="text-[10px] font-mono font-bold text-ink/40 uppercase tracking-widest">
              Showing <span className="text-ink">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-ink">{Math.min(currentPage * itemsPerPage, rawLogsSorted.length)}</span> of <span className="text-ink">{rawLogsSorted.length}</span> entries
            </p>
            <div className="flex items-center gap-2">
              <button 
                id="prev_page_button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-2 hover:bg-background rounded-xl transition-all disabled:opacity-20 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => {
                  const pageNum = i + 1;
                  if (totalPages > 5 && pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - currentPage) > 1) {
                    if (pageNum === 2 || pageNum === totalPages - 1) {
                      return <span key={`dots-${pageNum}`} className="text-ink/20">...</span>;
                    }
                    return null;
                  }
                  return (
                    <button
                      key={`page-${pageNum}`}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-7 h-7 rounded-lg font-mono text-[10px] font-bold transition-all ${
                        currentPage === pageNum 
                          ? 'bg-zinc-900 text-white shadow-md' 
                          : 'text-ink/40 hover:bg-background hover:text-ink'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button 
                id="next_page_button"
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
    </div>
  );
}

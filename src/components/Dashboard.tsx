import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area,
  TooltipProps
} from 'recharts';
import { motion } from 'motion/react';
import { TrendingUp, Package, MapPin, ClipboardList, AlertTriangle, Activity, ArrowUpRight, ShoppingCart, DollarSign, ArrowRightLeft, Layers } from 'lucide-react';

interface DashboardProps {
  inventory: any[];
  branches: any[];
  products: any[];
  orders: any[];
  transactions: any[];
  sales: any[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-ink p-4 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md">
        <p className="text-[10px] font-mono font-bold text-white/40 uppercase mb-2 tracking-widest">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-[11px] text-white/80 font-medium">{entry.name}:</span>
              </div>
              <span className="text-xs font-mono font-bold text-white">{entry.value}</span>
            </div>
          ))}
        </div>
        {payload.length > 1 && (
          <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
            <span className="text-[10px] font-mono text-white/40 uppercase">Total:</span>
            <span className="text-xs font-mono font-bold text-primary">
              {payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0)}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function Dashboard({ inventory, branches, products, orders, transactions, sales }: DashboardProps) {
  const [activeSeries, setActiveSeries] = React.useState<string[]>([]);
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    // Add a slight delay to ensure parent layout is finished before Recharts calculates dimensions
    // 300ms matches standard transition times
    const timer = setTimeout(() => setIsMounted(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Aggregate stock by product
  const productStock = React.useMemo(() => products.map(p => ({
    name: p.name,
    stock: inventory
      .filter(i => i.product_id === p.id)
      .reduce((sum, item) => sum + Number(item.stock || 0), 0)
  })), [products, inventory]);

  // Aggregate stock by branch
  const branchStock = React.useMemo(() => branches.map(b => {
    const data: any = { name: b.name };
    products.forEach(p => {
      const item = inventory.find(i => i.branch_id === b.id && i.product_id === p.id);
      data[p.name] = item ? Number(item.stock || 0) : 0;
    });
    return data;
  }), [branches, products, inventory]);

  const toggleSeries = (e: any) => {
    const { dataKey } = e;
    setActiveSeries(prev => 
      prev.includes(dataKey) 
        ? prev.filter(key => key !== dataKey) 
        : [...prev, dataKey]
    );
  };

  // Critical Stock (Less than 5)
  const criticalStock = React.useMemo(() => {
    return inventory
      .filter(i => Number(i.stock || 0) <= 5)
      .map(i => ({
        branch: branches.find(b => b.id === i.branch_id)?.name,
        product: products.find(p => p.id === i.product_id)?.name,
        stock: Number(i.stock || 0)
      }))
      .sort((a, b) => a.stock - b.stock);
  }, [inventory, branches, products]);

  // Movement velocity (last 24h transactions)
  const recentMovementsCount = React.useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return (transactions || []).filter(t => new Date(t.timestamp).getTime() > dayAgo).length;
  }, [transactions]);

  // Calculate trends for the last 7 days
  const movementTrends = React.useMemo(() => {
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0)).getTime();
      const endOfDay = new Date(date.setHours(23, 59, 59, 999)).getTime();
      
      const dayCount = (transactions || []).filter(t => {
        const ts = new Date(t.timestamp).getTime();
        return ts >= startOfDay && ts <= endOfDay;
      }).length;

      trends.push({
        date: date.toLocaleDateString(undefined, { weekday: 'short' }),
        count: dayCount
      });
    }
    return trends;
  }, [transactions]);

  // Sales Metrics
  const totalRevenue = React.useMemo(() => (sales || []).reduce((sum, s) => sum + (s.total || 0), 0), [sales]);
  const salesCount = sales?.length || 0;

  // Inventory Level Fluctuations for top products
  const inventoryTimeSeries = React.useMemo(() => {
    // 1. Get top 5 products by transaction volume
    const topProducts = products.map(p => ({
      ...p,
      volume: transactions.filter(t => t.product_id === p.id).length
    })).sort((a, b) => b.volume - a.volume).slice(0, 5);

    const days = 14; 
    const data = [];
    
    // Calculate current aggregate stocks
    const currentStocks = new Map();
    products.forEach(p => {
      const total = inventory
        .filter(i => i.product_id === p.id)
        .reduce((sum, item) => sum + Number(item.stock || 0), 0);
      currentStocks.set(p.id, total);
    });

    for (let i = 0; i <= days; i++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - i);
        targetDate.setHours(23, 59, 59, 999);
        const targetTs = targetDate.getTime();

        const dayData: any = {
          date: targetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          rawDate: targetDate
        };

        topProducts.forEach(p => {
           // Sum of transactions AFTER targetDate
           const txAfter = transactions.filter(t => 
             t.product_id === p.id && 
             new Date(t.timestamp).getTime() > targetTs
           );

           let delta = 0;
           txAfter.forEach(t => {
             if (t.type === 'add') delta += t.amount;
             else if (t.type === 'remove') delta -= t.amount;
           });

           dayData[p.name] = Math.max(0, (currentStocks.get(p.id) || 0) - delta);
        });
        
        data.push(dayData);
    }

    return { 
      data: data.slice().sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime()),
      activeProducts: topProducts
    };
  }, [inventory, transactions, products]);

  const COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6', '#EC4899'];

  return (
    <div className="space-y-10">
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-5">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.02]"
        >
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Branches</p>
              <h3 className="text-3xl font-mono font-bold text-ink tracking-tighter">{branches.length}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.02]"
        >
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center">
              <Package className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Products</p>
              <h3 className="text-3xl font-mono font-bold text-ink tracking-tighter">{products.length}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.02]"
        >
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-warning/10 rounded-2xl flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Pending</p>
              <h3 className="text-3xl font-mono font-bold text-ink tracking-tighter">
                {orders?.filter(o => o.status?.toLowerCase() === 'pending').length || 0}
              </h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.02]"
        >
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Activity</p>
              <h3 className="text-3xl font-mono font-bold text-ink tracking-tighter">{recentMovementsCount}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-primary p-6 rounded-[2rem] border border-white/10 shadow-xl shadow-primary/20 text-white"
        >
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-white/50 font-bold tracking-widest">Total Sales</p>
              <h3 className="text-3xl font-mono font-bold text-white tracking-tighter">{salesCount}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white p-6 rounded-[2rem] border border-ink/5 shadow-xl shadow-ink/[0.02]"
        >
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Revenue</p>
              <h3 className="text-3xl font-mono font-bold text-ink tracking-tighter">${totalRevenue.toFixed(0)}</h3>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Branch Stock Chart */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01]"
        >
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-serif font-medium text-2xl text-ink italic">Node Distribution</h3>
            <span className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Global Mesh</span>
          </div>
          <div className="min-h-[400px] h-[400px] w-full relative min-w-0">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={branchStock} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} opacity={0.5} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
                    tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold', fontFamily: 'JetBrains Mono' }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    cursor={{fill: '#F8FAFC'}}
                    content={<CustomTooltip />}
                  />
                  <Legend 
                    iconType="circle" 
                    onClick={toggleSeries}
                    wrapperStyle={{ cursor: 'pointer', paddingTop: '20px', fontSize: '9px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px' }} 
                  />
                  {products.map((p, idx) => (
                    <Bar 
                      key={p.id} 
                      dataKey={p.name} 
                      stackId="a" 
                      fill={COLORS[idx % COLORS.length]} 
                      hide={activeSeries.length > 0 && !activeSeries.includes(p.name)}
                      radius={idx === products.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                      barSize={16}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Product Stock Chart */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01]"
        >
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-serif font-medium text-2xl text-ink italic">Concentration Hub</h3>
            <span className="text-[10px] font-mono uppercase text-ink/40 font-bold tracking-widest">Density Map</span>
          </div>
          <div className="min-h-[400px] h-[400px] w-full relative min-w-0">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={productStock}
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="80%"
                    paddingAngle={5}
                    dataKey="stock"
                    stroke="none"
                  >
                    {productStock.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                        style={{ filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.1))' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', paddingTop: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>
      
      {/* Inventory Fluctuations Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01]"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="font-serif font-medium text-2xl text-ink italic">Magnitude Flux</h3>
            <p className="text-[10px] font-mono text-ink/40 uppercase font-bold tracking-widest mt-1">Artifact History (Past 14 Cycles)</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-1.5 bg-background rounded-full border border-ink/5">
            <span className="text-[9px] font-mono font-bold text-ink/40 uppercase tracking-widest">Active Artifacts: <span className="text-primary">{inventoryTimeSeries.activeProducts.length}</span></span>
          </div>
        </div>
        
        <div className="min-h-[400px] h-[400px] w-full relative min-w-0">
          {isMounted && (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={inventoryTimeSeries.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  {inventoryTimeSeries.activeProducts.map((p, idx) => (
                    <linearGradient key={`grad-${p.id}`} id={`color-${p.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} opacity={0.5} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold', fontFamily: 'JetBrains Mono' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold', fontFamily: 'JetBrains Mono' }} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '30px', fontSize: '9px', textTransform: 'uppercase', fontWeight: 'black', letterSpacing: '1px' }}
                />
                {inventoryTimeSeries.activeProducts.map((p, idx) => (
                  <Area
                    key={p.id}
                    type="monotone"
                    dataKey={p.name}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill={`url(#color-${p.id})`}
                    animationDuration={2000}
                    animationBegin={idx * 150}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Critical Stock and Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01]"
        >
          <div className="flex items-center gap-2 mb-8 text-danger">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-serif font-medium text-2xl italic text-ink">System Alerts</h3>
          </div>
          <div className="space-y-4">
            {criticalStock.slice(0, 5).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-danger/5 rounded-3xl border border-danger/10 group hover:bg-danger transition-all overflow-hidden relative">
                <div className="relative z-10">
                  <p className="text-xs font-black text-danger group-hover:text-white uppercase tracking-tight">{item.product}</p>
                  <p className="text-[10px] font-mono text-ink/40 uppercase group-hover:text-white/60 font-bold">{item.branch}</p>
                </div>
                <span className="font-mono text-2xl font-black text-danger group-hover:text-white relative z-10">{item.stock}</span>
                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-10 transition-opacity">
                   <AlertTriangle className="w-16 h-16 text-white" />
                </div>
              </div>
            ))}
            {criticalStock.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center text-accent">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <p className="text-center text-sm text-ink/30 font-mono italic">Sector normal. All indices stable.</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-ink p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden text-white"
        >
           <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
              <TrendingUp className="w-64 h-64 text-white" />
           </div>

           <div className="flex justify-between items-center mb-10 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                 <Activity className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-serif font-medium text-2xl italic">Temporal Velocity</h3>
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full border border-white/10">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[9px] font-mono font-bold text-white/60 uppercase tracking-widest">Real-time Stream</span>
            </div>
          </div>
          
          <div className="space-y-8 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <p className="text-sm text-white/40 font-mono italic leading-relaxed">
                Aggregating spectral data from {branches.length} endpoints. Network health optimal. Total system magnitude <span className="text-primary font-bold">{inventory.reduce((sum, i) => sum + Number(i.stock || 0), 0)} units</span> currently registered across node grid.
              </p>
              <div className="flex justify-end items-end gap-1">
                 {movementTrends.map((t, i) => (
                   <div key={i} className="flex flex-col items-center gap-2">
                     <div 
                      className="w-8 bg-primary/40 hover:bg-primary rounded-t-lg transition-all" 
                      style={{ height: `${Math.max(t.count * 10, 20)}px` }}
                      title={`${t.date}: ${t.count}`}
                     />
                     <span className="text-[8px] font-mono text-white/30 uppercase">{t.date}</span>
                   </div>
                 ))}
              </div>
            </div>

            <div className="min-h-[200px] h-[200px] w-full bg-white/[0.03] rounded-[2rem] p-4 border border-white/[0.05] relative min-w-0">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={movementTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip content={<CustomTooltip />} />
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" opacity={0.05} vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fill: '#ffffff', opacity: 0.3, fontFamily: 'JetBrains Mono' }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      name="Transactions"
                      stroke="#6366F1" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorCount)" 
                      animationBegin={300}
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

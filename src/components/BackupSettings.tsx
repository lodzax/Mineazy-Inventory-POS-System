import React, { useState } from 'react';
import { Database, Cloud, CheckCircle2, XCircle, RefreshCcw, ExternalLink, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

interface BackupSettingsProps {
  role: string | null;
}

export default function BackupSettings({ role }: BackupSettingsProps) {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if role is admin/manager
  const isAdmin = role === 'Administrator' || role === 'Manager';

  if (!isAdmin) return null;

  const handleManualBackup = async () => {
    setIsBackingUp(true);
    setError(null);
    setSuccess(false);
    
    try {
      const response = await fetch('/api/admin/backup', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to initiate backup. Check server logs.');
      }
      
      const data = await response.json();
      setSuccess(true);
      setLastBackup(new Date().toLocaleString());
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01]"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Cloud className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-serif font-medium text-2xl text-ink italic leading-tight">Backup Protocol</h3>
            <p className="text-[10px] font-mono text-ink/40 uppercase font-bold tracking-widest mt-1">Encrypted Google Drive Sync</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-background rounded-full border border-ink/5">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <span className="text-[10px] font-mono font-bold text-ink/40 uppercase tracking-widest">Active Protection Agent</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div className="space-y-4 p-6 bg-background rounded-[2rem] border border-ink/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-110 transition-transform">
             <Database className="w-32 h-32 text-ink" />
          </div>
          <p className="text-[9px] font-mono uppercase text-ink/30 font-bold tracking-[0.2em] relative z-10">Target Directory</p>
          <div className="flex items-center gap-3 relative z-10">
            <span className="text-xs font-mono font-black text-ink/70 break-all">1NKCTznTCXedGRXmGKcrksGztknkrV-JR</span>
            <a 
              href="https://drive.google.com/drive/folders/1NKCTznTCXedGRXmGKcrksGztknkrV-JR" 
              target="_blank" 
              rel="noreferrer"
              className="p-2 hover:bg-ink/5 rounded-lg transition-colors text-primary"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="space-y-4 p-6 bg-background rounded-[2rem] border border-ink/5 relative overflow-hidden group">
          <p className="text-[9px] font-mono uppercase text-ink/30 font-bold tracking-[0.2em]">Temporal Status</p>
          <div className="flex flex-col">
            <span className="text-xs font-mono font-bold text-ink/60">Automated: <span className="text-accent">EVERY 24H</span></span>
            <span className="text-xs font-mono font-bold text-ink/60 mt-1">Last Transmission: <span className="text-primary">{lastBackup || 'Idle'}</span></span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <button 
            disabled={isBackingUp}
            onClick={handleManualBackup}
            className="w-full md:w-auto px-10 py-5 bg-ink text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:translate-y-[-4px] active:scale-95 transition-all flex items-center justify-center gap-4 group disabled:opacity-50 disabled:translate-y-0"
          >
            {isBackingUp ? (
              <RefreshCcw className="w-5 h-5 animate-spin" />
            ) : (
              <Database className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            )}
            {isBackingUp ? 'TRANSMITTING...' : 'INITIATE MANUAL SYNC'}
          </button>
          
          <div className="flex flex-1 flex-col gap-1">
             <p className="text-[10px] font-mono text-ink/40 leading-relaxed max-w-md">
               Initiating manual sync will compile all inventory, transactions, orders, and sales records into an encrypted XLSX artifact and upload to the network hub.
             </p>
          </div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-5 bg-danger/10 border border-danger/20 rounded-3xl flex items-center gap-4 text-danger"
          >
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-xs font-mono font-bold uppercase tracking-tight">{error}</p>
          </motion.div>
        )}

        {success && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-5 bg-accent/10 border border-accent/20 rounded-3xl flex items-center gap-4 text-accent"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-xs font-mono font-bold uppercase tracking-tight">Handshake Successful. Payload securely delivered to hub.</p>
          </motion.div>
        )}
      </div>

      <div className="mt-10 pt-10 border-t border-ink/5">
        <div className="flex flex-wrap gap-2">
           <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-bold text-ink/40 uppercase tracking-widest">Inventory Snapshot</span>
           <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-bold text-ink/40 uppercase tracking-widest">Supply Audit</span>
           <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-bold text-ink/40 uppercase tracking-widest">Transaction Delta</span>
           <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-bold text-ink/40 uppercase tracking-widest">Sales Ledger</span>
           <span className="px-3 py-1 bg-ink/5 rounded-full text-[9px] font-mono font-bold text-ink/40 uppercase tracking-widest">Order Vault</span>
        </div>
      </div>
    </motion.div>
  );
}

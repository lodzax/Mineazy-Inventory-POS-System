import React, { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Key, UserCog, Search, Briefcase, MapPin, Save, ShieldAlert, CheckCircle2, XCircle, Lock, User, Sparkles } from 'lucide-react';
import BackupSettings from './BackupSettings';

interface SettingsViewProps {
  profile: any;
  profiles: any[];
  branches: any[];
  updateUserProfile: (id: string, updates: { role?: string; branch_id?: string | null }) => Promise<void>;
}

export default function SettingsView({ profile, profiles, branches, updateUserProfile }: SettingsViewProps) {
  const isAdmin = profile?.role === 'Administrator';
  
  // State for user self-password reset
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // State for Admin user management
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editedRole, setEditedRole] = useState<string>('');
  const [editedBranchId, setEditedBranchId] = useState<string>('');
  const [managementLoading, setManagementLoading] = useState<string | null>(null);
  const [managementSuccess, setManagementSuccess] = useState<string | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);

  // Self-password change handler
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess("Your security credentials have been updated successfully.");
      alert("Your security credentials have been updated successfully!");
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update security credentials.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // Admin save changes for a specific user
  const handleUserUpdate = async (userId: string) => {
    setManagementError(null);
    setManagementSuccess(null);
    setManagementLoading(userId);

    try {
      // Clean up branch assignment depending on role rules
      // (E.g. Administrators and Purchasing don't strictly require/have a branch lock, but we keep it optional)
      const targetBranch = editedBranchId === 'none' || editedBranchId === '' ? null : editedBranchId;
      
      await updateUserProfile(userId, { 
        role: editedRole, 
        branch_id: targetBranch 
      });

      setManagementSuccess(`Profile updated for selected user.`);
      alert("User profile and privileges updated successfully!");
      setEditingUserId(null);
    } catch (err: any) {
      setManagementError(err.message || "Failed to apply changes to user profile.");
    } finally {
      setManagementLoading(null);
    }
  };

  // Filter users based on query
  const filteredProfiles = profiles.filter(p => 
    p.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    p.role?.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  return (
    <div className="space-y-10">
      
      {/* SECTION 1: Self Account Security (Enabled for ALL roles) */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01]"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-serif font-medium text-2xl text-ink italic leading-tight">Identity Security</h3>
            <p className="text-[10px] font-mono text-ink/40 uppercase font-bold tracking-widest mt-1">Change Authentication Credentials</p>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-6 max-w-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">New Password</label>
              <input 
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm"
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase text-ink/40 font-bold ml-1">Confirm New Password</label>
              <input 
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-5 py-4 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
            <p className="text-[11px] text-ink/40 font-mono italic max-w-md">
              Password must be at least 6 characters. Changing credentials will immediately update your security session.
            </p>
            <button 
              type="submit"
              disabled={passwordLoading}
              className="px-8 py-4 bg-ink text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:translate-y-[-2px] active:scale-95 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <Key className="w-4 h-4 text-accent group-hover:rotate-12 transition-all" />
              {passwordLoading ? "Updating Session..." : "Update Password"}
            </button>
          </div>

          {passwordError && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-danger/5 border border-danger/10 text-danger rounded-2xl text-xs font-mono flex items-center gap-2"
            >
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{passwordError}</span>
            </motion.div>
          )}

          {passwordSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-accent/5 border border-accent/10 text-accent rounded-2xl text-xs font-mono flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{passwordSuccess}</span>
            </motion.div>
          )}
        </form>
      </motion.div>

      {/* SECTION 2: Administrator User Matrix (Enabled for ADMINISTRATOR role only) */}
      {isAdmin && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2.5rem] border border-ink/5 shadow-xl shadow-ink/[0.01]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-ink/5 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
                <UserCog className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-serif font-medium text-2xl text-ink italic leading-tight">User Administration</h3>
                <p className="text-[10px] font-mono text-ink/40 uppercase font-bold tracking-widest mt-1">Global Authorization & Role Mapping</p>
              </div>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
              <input 
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search database operators..."
                className="w-full pl-11 pr-4 py-3 bg-background border border-ink/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs text-ink"
              />
            </div>
          </div>

          {/* Status Display */}
          {managementError && (
            <div className="mb-6 p-4 bg-danger/5 border border-danger/10 text-danger rounded-2xl text-xs font-mono flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{managementError}</span>
            </div>
          )}
          {managementSuccess && (
            <div className="mb-6 p-4 bg-accent/5 border border-accent/10 text-accent rounded-2xl text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{managementSuccess}</span>
            </div>
          )}

          <div className="overflow-hidden border border-ink/5 rounded-[2rem]">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background text-[10px] font-mono uppercase tracking-[0.15em] text-ink/40 border-b border-ink/5">
                    <th className="py-5 px-6 font-black">Email & Security Identifier</th>
                    <th className="py-5 px-6 font-black">Current Authorization Role</th>
                    <th className="py-5 px-6 font-black">Branch Access Boundary</th>
                    <th className="py-5 px-6 font-black text-right">System Configuration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 text-sm">
                  {filteredProfiles.length > 0 ? (
                    filteredProfiles.map((p) => {
                      const isEditing = editingUserId === p.id;
                      const userBranch = branches.find(b => b.id === p.branch_id);
                      const isCurrentUser = p.id === profile?.id;

                      return (
                        <tr key={p.id} className="hover:bg-background/20 transition-colors">
                          {/* User Email & ID */}
                          <td className="py-5 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-ink/5 flex items-center justify-center text-ink/60 font-mono text-xs font-bold uppercase">
                                <User className="w-4 h-4 text-ink/40" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-mono font-bold text-ink flex items-center gap-2">
                                  {p.email} 
                                  {isCurrentUser && (
                                    <span className="px-1.5 py-0.5 bg-accent/10 text-accent text-[8px] uppercase font-mono rounded font-black tracking-widest">Self</span>
                                  )}
                                </span>
                                <span className="text-[10px] font-mono text-ink/30 uppercase">ID: {p.id.slice(0, 18)}...</span>
                              </div>
                            </div>
                          </td>

                          {/* Role Selection */}
                          <td className="py-5 px-6">
                            {isEditing ? (
                              <select
                                value={editedRole}
                                onChange={(e) => setEditedRole(e.target.value)}
                                className="px-3 py-2 bg-background border border-ink/5 rounded-xl font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-ink"
                              >
                                <option value="Administrator">Administrator</option>
                                <option value="Manager">Manager</option>
                                <option value="Supervisor">Supervisor</option>
                                <option value="Cashier">Cashier</option>
                                <option value="Warehouse">Warehouse</option>
                                <option value="Purchasing">Purchasing</option>
                              </select>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase font-black ${
                                p.role === 'Administrator' ? 'bg-ink text-white' :
                                p.role === 'Manager' ? 'bg-primary/10 text-primary' :
                                p.role === 'Supervisor' ? 'bg-accent/10 text-accent' :
                                p.role === 'Purchasing' ? 'bg-blue-500/10 text-blue-600' :
                                p.role === 'Warehouse' ? 'bg-yellow-500/10 text-yellow-600' :
                                'bg-ink/5 text-ink/65'
                              }`}>
                                <Briefcase className="w-3 h-3" />
                                {p.role || 'Cashier'}
                              </span>
                            )}
                          </td>

                          {/* Branch Selection */}
                          <td className="py-5 px-6">
                            {isEditing ? (
                              <select
                                value={editedBranchId}
                                onChange={(e) => setEditedBranchId(e.target.value)}
                                className="px-3 py-2 bg-background border border-ink/5 rounded-xl font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-ink"
                              >
                                <option value="none">No Branch Boundary (Global)</option>
                                {branches.map((b) => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                                <MapPin className="w-3.5 h-3.5 text-primary" />
                                <span className={userBranch ? "text-ink font-semibold" : "italic text-ink/30"}>
                                  {userBranch?.name || "Global Network Access"}
                                </span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-5 px-6 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingUserId(null)}
                                  className="px-3 py-1.5 border border-ink/5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg hover:bg-background text-ink/50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={managementLoading === p.id}
                                  onClick={() => handleUserUpdate(p.id)}
                                  className="px-4 py-1.5 bg-accent text-accent-foreground font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-accent/90 transition-all flex items-center gap-1.5"
                                >
                                  {managementLoading === p.id ? (
                                    <span>Applying...</span>
                                  ) : (
                                    <>
                                      <Save className="w-3.5 h-3.5" />
                                      Apply
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUserId(p.id);
                                  setEditedRole(p.role || 'Cashier');
                                  setEditedBranchId(p.branch_id || '');
                                }}
                                className="px-4 py-1.5 border border-primary/20 hover:bg-primary/10 text-primary font-black text-[10px] uppercase tracking-widest rounded-lg transition-all"
                              >
                                Modify Access
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-ink/30 font-mono text-xs uppercase tracking-widest italic">
                        No operators match the specified search coordinates.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* SECTION 3: Google Drive System Backups */}
      <BackupSettings role={profile?.role || null} />
      
    </div>
  );
}

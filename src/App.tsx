/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Settings, 
  History as HistoryIcon, 
  Bell, 
  BellOff, 
  Trash2, 
  Clock,
  ChevronRight,
  TrendingUp,
  LayoutDashboard,
  Calendar,
  LogOut,
  Droplets
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy
} from 'firebase/firestore';
import { auth, db, signInWithGoogle, logOut, handleFirestoreError } from './lib/firebase';

interface Entry {
  id: string;
  amount: number;
  timestamp: number;
}

const PRESETS = [
  { ml: 250, label: 'Small Glass', icon: '💧' },
  { ml: 500, label: 'Standard Bottle', icon: '🥤' },
  { ml: 750, label: 'Large Flask', icon: '🍼' }
];

type Tab = 'overview' | 'history' | 'trends';

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null | undefined>(undefined);
  
  // Navigation
  const [currentTab, setCurrentTab] = useState<Tab>('overview');
  
  // Data State
  const [goal, setGoal] = useState<number>(2000);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(60);
  const [logs, setLogs] = useState<Entry[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [lastReminder, setLastReminder] = useState<number>(Date.now());
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
  }, []);

  // Fetch User Data & Logs
  useEffect(() => {
    if (!user) return;

    // Get User Settings
    const userDocRef = doc(db, 'users', user.uid);
    getDoc(userDocRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGoal(data.goal || 2000);
        setIntervalMinutes(data.intervalMinutes || 60);
      } else {
        // Initialize user profile
        setDoc(userDocRef, {
          goal: 2000,
          intervalMinutes: 60,
          updatedAt: new Date().toISOString()
        });
      }
    });

    // Sub to Logs
    const logsColRef = collection(db, 'users', user.uid, 'logs');
    const q = query(logsColRef, orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const entries: Entry[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Entry));
      setLogs(entries);
    }, (err) => {
      handleFirestoreError(err, 'list', `users/${user.uid}/logs`);
    });

    return () => unsubscribe();
  }, [user]);

  // Derived Values
  const todayStart = new Date().setHours(0, 0, 0, 0);
  
  const todayLogs = useMemo(() => 
    logs.filter(log => log.timestamp >= todayStart),
  [logs, todayStart]);

  const totalToday = useMemo(() => 
    todayLogs.reduce((acc, curr) => acc + curr.amount, 0),
  [todayLogs]);

  const progress = Math.min((totalToday / goal) * 100, 100);
  
  // Weekly Trends Data
  const weeklyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      
      const start = d.getTime();
      const end = start + 86400000;
      
      const dailyTotal = logs
        .filter(log => log.timestamp >= start && log.timestamp < end)
        .reduce((acc, curr) => acc + curr.amount, 0);
        
      days.push({
        name: d.toLocaleDateString('en-US', { weekday: 'short' }),
        amount: dailyTotal,
        date: d.toLocaleDateString(),
        isToday: i === 0
      });
    }
    return days;
  }, [logs]);

  // Notifications
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  useEffect(() => {
    if (notificationsEnabled) {
      const timer = setInterval(() => {
        const now = Date.now();
        const diff = (now - lastReminder) / (1000 * 60);

        if (diff >= intervalMinutes) {
          new Notification('HydraTrack', {
            body: 'Time to drink some water! Stay hydrated.',
            icon: '/favicon.ico'
          });
          setLastReminder(now);
        }
      }, 10000);
      return () => clearInterval(timer);
    }
  }, [notificationsEnabled, intervalMinutes, lastReminder]);

  const addWater = async (amount: number) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'logs'), {
        amount,
        timestamp: Date.now()
      });
      setLastReminder(Date.now());
    } catch (err) {
      handleFirestoreError(err, 'create', `users/${user.uid}/logs`);
    }
  };

  const removeEntry = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'logs', id));
    } catch (err) {
      handleFirestoreError(err, 'delete', `users/${user.uid}/logs/${id}`);
    }
  };

  const updateSettings = async (newGoal: number, newInterval: number) => {
    if (!user) return;
    setGoal(newGoal);
    setIntervalMinutes(newInterval);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        goal: newGoal,
        intervalMinutes: newInterval,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${user.uid}`);
    }
  };

  const formattedDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Initial Loading
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
          <Droplets className="w-8 h-8 text-sky-400" />
        </motion.div>
      </div>
    );
  }

  // Auth Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 text-center space-y-8"
        >
          <div className="bg-sky-500/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto">
            <Droplets className="w-10 h-10 text-sky-500" />
          </div>
          <div>
            <h1 className="text-4xl font-light tracking-tight">Hydra<span className="font-semibold text-sky-400">Track</span></h1>
            <p className="text-slate-400 mt-2 text-sm leading-relaxed">Securely track your daily hydration goal and view your progress from any device.</p>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="w-full py-5 rounded-2xl bg-white text-slate-950 font-bold flex items-center justify-center gap-3 hover:bg-slate-100 transition-all active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Continue with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col p-6 md:p-10 max-w-6xl mx-auto font-sans">
      {/* Header Section */}
      <header className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="bg-sky-500/10 p-2 rounded-xl">
             <Droplets className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-light tracking-tight">Hydra<span className="font-semibold text-sky-400">Track</span></h1>
            <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-0.5">
              {currentTab} Mode
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">Today</p>
            <p className="text-xl font-light tracking-tight">{formattedDate}</p>
          </div>
          <button 
            onClick={logOut}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-red-400 transition-colors"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow">
        <AnimatePresence mode="wait">
          {currentTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-8"
            >
              {/* Progress Circle Column */}
              <section className="col-span-1 md:col-span-5 bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8 md:p-10 flex flex-col items-center justify-center relative overflow-hidden h-[450px]">
                <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>
                
                <div className="relative w-64 h-64 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="128" cy="128" r="115" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-800" />
                    <motion.circle 
                      cx="128" 
                      cy="128" 
                      r="115" 
                      stroke="currentColor" 
                      strokeWidth="10" 
                      fill="transparent" 
                      strokeDasharray={722}
                      initial={{ strokeDashoffset: 722 }}
                      animate={{ strokeDashoffset: 722 - (722 * (progress/100)) }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="text-sky-500" 
                      strokeLinecap="round" 
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-6xl font-extralight tracking-tighter tabular-nums">{(totalToday / 1000).toFixed(1)}</span>
                    <span className="text-slate-400 uppercase tracking-[0.2em] text-[10px] mt-1 font-bold">Liters Today</span>
                  </div>
                </div>

                <div className="mt-10 text-center w-full">
                  <p className="text-slate-400 text-sm font-medium">Goal: <span className="text-slate-100 font-bold">{(goal / 1000).toFixed(1)}L</span></p>
                  <div className="mt-4 flex justify-center gap-1.5 h-1.5 px-4">
                    {[...Array(5)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`flex-1 rounded-full transition-colors duration-500 ${
                          (progress / 20) > i ? 'bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'bg-slate-800'
                        }`}
                      ></div>
                    ))}
                    </div>
                </div>
              </section>

              {/* Controls Column */}
              <div className="col-span-1 md:col-span-7 flex flex-col gap-6">
                <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8">
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-6 font-black">Quick Add</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {PRESETS.map((p) => (
                      <button key={p.ml} onClick={() => addWater(p.ml)} className={`flex flex-col items-center gap-2 p-5 rounded-2xl border transition-all active:scale-95 group ${p.ml === 500 ? 'bg-sky-500 border-sky-400 text-slate-950' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
                        <span className="text-2xl">{p.icon}</span>
                        <span className="font-bold text-base">{p.ml}ml</span>
                        <span className={`text-[9px] uppercase font-bold tracking-tight ${p.ml === 500 ? 'opacity-70' : 'text-slate-500'}`}>{p.label}</span>
                      </button>
                    ))}
                    <button onClick={() => { const amt = prompt('Amount (ml):', '250'); if(amt) addWater(parseInt(amt)); }} className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 col-span-2 sm:col-span-1">
                      <Plus className="w-6 h-6 text-sky-400" />
                      <span className="font-bold text-base">Custom</span>
                    </button>
                  </div>
                </section>

                <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8 flex-grow">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">Reminder Status</h2>
                    <button onClick={requestNotificationPermission} className={`p-2 rounded-xl transition-all ${notificationsEnabled ? 'text-sky-400 bg-sky-400/10' : 'text-slate-500 bg-slate-800'}`}>
                      {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-5 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-black">Notification Interval</p>
                      <p className="text-xl font-medium mt-1 text-sky-400">Every {intervalMinutes} Minutes</p>
                    </div>
                    <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors">
                      <Settings className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {currentTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8 min-h-[500px] flex flex-col"
            >
              <h2 className="text-lg font-light tracking-tight mb-8">Drinking <span className="font-semibold text-sky-400">History</span></h2>
              <div className="space-y-4 overflow-y-auto pr-4 custom-scrollbar flex-grow">
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-600 space-y-4">
                    <HistoryIcon className="w-12 h-12 opacity-20" />
                    <p className="italic">No history data yet.</p>
                  </div>
                ) : (
                  logs.map((entry) => (
                    <div key={entry.id} className="flex justify-between items-center py-4 border-b border-slate-800/50 last:border-0 group">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col items-center w-12 text-slate-500 text-[10px] font-black uppercase">
                          <Calendar className="w-4 h-4 mb-1 opacity-40" />
                          {new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-200 text-lg">{entry.amount} <span className="text-xs uppercase text-slate-500">ml</span></p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5 mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => removeEntry(entry.id)} className="p-2 text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all font-bold">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {currentTab === 'trends' && (
            <motion.div 
              key="trends"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8 min-h-[500px] flex flex-col"
            >
              <h2 className="text-lg font-light tracking-tight mb-8">Weekly <span className="font-semibold text-sky-400">Trends</span></h2>
              <div className="flex-grow w-full h-[350px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} 
                    />
                    <YAxis hide domain={[0, Math.max(goal, ...weeklyData.map(d => d.amount))]} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(56, 189, 248, 0.05)' }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#38bdf8', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="amount" radius={[8, 8, 8, 8]} barSize={40}>
                      {weeklyData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.amount >= goal ? '#38bdf8' : '#1e293b'} 
                          className="transition-all duration-300"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="p-5 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">7-Day Average</p>
                  <p className="text-2xl font-light text-slate-100 mt-2">
                    {(weeklyData.reduce((acc, curr) => acc + curr.amount, 0) / 7 / 1000).toFixed(2)}L
                  </p>
                </div>
                <div className="p-5 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Goal Status</p>
                  <p className="text-2xl font-light text-slate-100 mt-2">
                    {weeklyData.filter(d => d.amount >= goal).length} <span className="text-xs uppercase text-slate-500 font-bold">/ 7 Days</span>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Navigation */}
      <footer className="mt-12 flex flex-col sm:flex-row justify-between items-center px-4 gap-6">
        <nav className="flex gap-10">
          <button 
            onClick={() => setCurrentTab('overview')}
            className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all pb-1 border-b-2 ${
              currentTab === 'overview' ? 'text-sky-400 border-sky-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Overview
          </button>
          <button 
            onClick={() => setCurrentTab('history')}
            className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all pb-1 border-b-2 ${
              currentTab === 'history' ? 'text-sky-400 border-sky-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <HistoryIcon className="w-3.5 h-3.5" />
            History
          </button>
          <button 
            onClick={() => setCurrentTab('trends')}
            className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all pb-1 border-b-2 ${
              currentTab === 'trends' ? 'text-sky-400 border-sky-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Trends
          </button>
        </nav>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Active Monitoring</span>
        </div>
      </footer>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-40" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 1, opacity: 0, y: 20 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl z-50 overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 to-transparent"></div>
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-bold tracking-tight">Configure</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              <div className="space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Daily Goal (ml)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[1500, 2000, 2500, 3000].map(g => (
                      <button key={g} onClick={() => setGoal(g)} className={`py-3 rounded-xl border text-xs font-bold transition-all ${goal === g ? 'border-sky-400 bg-sky-400/10 text-sky-400' : 'border-slate-800 bg-slate-950/50 text-slate-500 hover:bg-slate-800'}`}>
                        {g/1000}L Target
                      </button>
                    ))}
                  </div>
                  <input type="range" min="500" max="5000" step="100" value={goal} onChange={(e) => setGoal(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400" />
                  <div className="text-center font-bold text-sky-400 text-lg tabular-nums">{goal}ml</div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Reminder Interval</label>
                  <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(parseInt(e.target.value))} className="w-full p-4 rounded-2xl bg-slate-950/50 border border-slate-800 outline-none font-bold text-slate-200 text-sm">
                    <option value="30">Every 30 Minutes</option>
                    <option value="60">Every Hour</option>
                    <option value="90">Every 1.5 Hours</option>
                    <option value="120">Every 2 Hours</option>
                  </select>
                </div>
                <button 
                  onClick={() => {
                    updateSettings(goal, intervalMinutes);
                    setShowSettings(false);
                  }} 
                  className="w-full py-5 rounded-2xl bg-sky-500 text-slate-950 font-black uppercase tracking-widest text-xs hover:bg-sky-400 active:scale-[0.98] transition-all"
                >
                  Apply Changes
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}


'use client';

import React, { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { LoomRecord, AppSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { getFromLocalStorage, saveToLocalStorage } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

const LOCAL_RECORDS_STORAGE_KEY = 'laxmi-shree-records-v2';
const LOCAL_SETTINGS_STORAGE_KEY = 'laxmi-shree-settings-v2';
const PENDING_SYNC_STORAGE_KEY = 'laxmi-shree-pending-sync';
const GLOBAL_SETTINGS_ID = 'global_settings';

type SupabaseStatus = 'disconnected' | 'connected' | 'reconnecting';
type PendingSyncOperation = 
    | { type: 'add' | 'update'; record: LoomRecord }
    | { type: 'delete'; id: string };

export interface AppContextType {
  records: LoomRecord[];
  settings: AppSettings;
  addRecord: (record: Omit<LoomRecord, 'id'>) => void;
  updateRecord: (updatedRecord: LoomRecord) => void;
  deleteRecord: (id: string) => void;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  deleteAllData: () => void;
  isInitialized: boolean;
  supabaseStatus: SupabaseStatus;
  pendingSyncCount: number;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [records, setRecords] = useState<LoomRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isInitialized, setIsInitialized] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus>('disconnected');
  const [pendingSync, setPendingSync] = useState<PendingSyncOperation[]>([]);
  const [initialSyncComplete, setInitialSyncComplete] = useState(false);
  
  const recordsChannel = useRef<RealtimeChannel | null>(null);
  const settingsChannel = useRef<RealtimeChannel | null>(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    setRecords(getFromLocalStorage<LoomRecord[]>(LOCAL_RECORDS_STORAGE_KEY, []));
    setSettings(getFromLocalStorage<AppSettings>(LOCAL_SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS));
    setPendingSync(getFromLocalStorage<PendingSyncOperation[]>(PENDING_SYNC_STORAGE_KEY, []));
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, pendingSync);
    }
  }, [pendingSync, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const { supabaseUrl, supabaseKey } = settings;
    if (supabaseUrl && supabaseKey) {
        if (!supabaseClient || supabaseClient.supabaseUrl !== supabaseUrl) {
            const client = createClient(supabaseUrl, supabaseKey, {
                realtime: {
                    params: {
                        eventsPerSecond: 2,
                    }
                }
            });
            setSupabaseClient(client);
        }
    } else {
        if(supabaseClient) {
            supabaseClient.removeAllChannels();
            setSupabaseClient(null);
        }
        setSupabaseStatus('disconnected');
        setInitialSyncComplete(false);
    }
    
    return () => {
        if (supabaseClient) {
            supabaseClient.removeAllChannels();
        }
    }
  }, [settings.supabaseUrl, settings.supabaseKey, isInitialized]);

  const processPending = useCallback(async () => {
    if (!supabaseClient || isSyncing.current || pendingSync.length === 0) return;

    isSyncing.current = true;
    toast({ title: `Syncing ${pendingSync.length} offline changes...` });

    const opsToProcess = [...pendingSync];
    let remainingOps = [...pendingSync];

    for (const op of opsToProcess) {
      try {
        if (op.type === 'add' || op.type === 'update') {
          const recordToUpsert = {
            ...op.record,
            stops: parseInt(op.record.stops as any, 10),
            weftMeter: parseFloat(op.record.weftMeter as any),
          };
          const { error } = await supabaseClient.from('loom_records').upsert(recordToUpsert);
          if (error) throw error;
        } else if (op.type === 'delete') {
          const { error } = await supabaseClient.from('loom_records').delete().eq('id', op.id);
          if (error) throw error;
        }
        remainingOps = remainingOps.filter(r => r !== op);
      } catch (error) {
        console.error('Failed to sync pending operation:', op.type, (op as any).record?.id || op.id, error);
      }
    }

    const successfulOps = opsToProcess.length - remainingOps.length;
    if (successfulOps > 0) {
      toast({ title: 'Sync complete!', description: `${successfulOps} change(s) have been saved.` });
    }
    if (remainingOps.length > 0) {
        toast({ title: 'Sync Partially Failed', description: `${remainingOps.length} changes could not be synced. Will retry.`, variant: 'destructive' });
    }
    
    setPendingSync(remainingOps);
    isSyncing.current = false;
  }, [supabaseClient, pendingSync]);

  useEffect(() => {
    if (!supabaseClient || !isInitialized) return;

    const setupSubscriptions = async () => {
      if (initialSyncComplete) return;

      setSupabaseStatus('reconnecting');
      try {
        const { data: initialSettings, error: settingsError } = await supabaseClient.from('settings').select('*').eq('id', GLOBAL_SETTINGS_ID).limit(1).single();
        if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;
        
        if (initialSettings) {
            setSettings(prev => {
                const newSettings = { ...prev, ...initialSettings };
                saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, newSettings);
                return newSettings;
            });
        }
        
        const { data: initialRecords, error: recordsError } = await supabaseClient.from('loom_records').select('*');
        if (recordsError) throw recordsError;
        
        setRecords(prevLocalRecords => {
            const remoteRecordsMap = new Map((initialRecords || []).map(r => [r.id, r]));
            const localRecordsMap = new Map(prevLocalRecords.map(r => [r.id, r]));
            const mergedRecords = Array.from(new Map([...localRecordsMap, ...remoteRecordsMap]).values());
            saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, mergedRecords);
            return mergedRecords;
        });

        setSupabaseStatus('connected');
        toast({ title: "Connected to Supabase", description: "Data is live." });
        setInitialSyncComplete(true);
      } catch (error) {
        console.error('Initial fetch from Supabase failed:', error);
        setSupabaseStatus('disconnected');
        toast({ title: 'Connection Failed', description: 'Could not fetch data from Supabase.', variant: 'destructive' });
      }
    };

    setupSubscriptions();
  }, [supabaseClient, isInitialized, initialSyncComplete]);

  useEffect(() => {
    if (initialSyncComplete && supabaseStatus === 'connected') {
      processPending();
    }
  }, [initialSyncComplete, supabaseStatus, processPending]);
  
  useEffect(() => {
    if (!supabaseClient || !isInitialized) return;

    if (settingsChannel.current) settingsChannel.current.unsubscribe();
    settingsChannel.current = supabaseClient.channel('settings-channel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: `id=eq.${GLOBAL_SETTINGS_ID}` }, (payload) => {
        setSettings(prev => ({...prev, ...payload.new as AppSettings}));
      }).subscribe();
      
    if (recordsChannel.current) recordsChannel.current.unsubscribe();
    recordsChannel.current = supabaseClient.channel('loom-records-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loom_records' }, (payload) => {
        const isPending = pendingSync.some(p => (p.type !== 'delete' && p.record.id === (payload.new as LoomRecord)?.id) || (p.type === 'delete' && p.id === payload.old.id));
        if (isSyncing.current && isPending) return;

        setRecords(currentRecords => {
          let newRecords = [...currentRecords];
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRecord = payload.new as LoomRecord;
            const existingIndex = newRecords.findIndex(r => r.id === newRecord.id);
            if (existingIndex > -1) newRecords[existingIndex] = newRecord;
            else newRecords.push(newRecord);
          } else if (payload.eventType === 'DELETE') {
            newRecords = newRecords.filter(r => r.id !== payload.old.id);
          }
          saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, newRecords);
          return newRecords;
        });
      }).subscribe((status) => {
          if (status === 'SUBSCRIBED') {
              if (supabaseStatus !== 'connected') setSupabaseStatus('connected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              if (supabaseStatus !== 'disconnected') setSupabaseStatus('disconnected');
          }
      });
      
    return () => {
      if (supabaseClient) {
        supabaseClient.removeAllChannels();
      }
      recordsChannel.current = null;
      settingsChannel.current = null;
    };
  }, [supabaseClient, isInitialized, pendingSync, supabaseStatus]);


  const syncOrQueue = useCallback((op: PendingSyncOperation) => {
    setPendingSync(prev => {
        // For updates/deletes, remove any older pending operations for the same record
        if(op.type !== 'add') {
            return [...prev.filter(p => (p.type !== 'delete' && p.record.id !== op.id) || (p.type === 'delete' && p.id !== op.id)), op];
        }
        return [...prev, op];
    });
  }, []);

  const addRecord = useCallback((record: Omit<LoomRecord, 'id'>) => {
    const newRecord: LoomRecord = { ...record, id: crypto.randomUUID() };
    setRecords(prev => {
        const updated = [...prev, newRecord];
        saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, updated);
        return updated;
    });
    syncOrQueue({ type: 'add', record: newRecord });
  }, [syncOrQueue]);

  const updateRecord = useCallback((updatedRecord: LoomRecord) => {
    setRecords(prev => {
        const updated = prev.map(r => r.id === updatedRecord.id ? updatedRecord : r);
        saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, updated);
        return updated;
    });
    syncOrQueue({ type: 'update', record: updatedRecord });
  }, [syncOrQueue]);

  const deleteRecord = useCallback((id: string) => {
    setRecords(prev => {
        const updated = prev.filter(r => r.id !== id);
        saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, updated);
        return updated;
    });
    syncOrQueue({ type: 'delete', id });
  }, [syncOrQueue]);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, updatedSettings);
    
    if (supabaseClient && supabaseStatus === 'connected') {
        try {
            const { supabaseKey, geminiApiKey, ...settingsToSave } = updatedSettings;
            const settingsWithId = { ...settingsToSave, id: GLOBAL_SETTINGS_ID };
            const { error } = await supabaseClient.from('settings').upsert(settingsWithId, { onConflict: 'id' });
            if(error) throw error;
            toast({ title: 'Settings saved to Supabase.' });
        } catch(e) {
             console.error("Failed to save settings to Supabase:", e);
             toast({ title: 'Cloud Save Failed', description: 'Settings saved locally, but failed to save to Supabase.', variant: 'destructive'});
        }
    } else {
        toast({ title: 'Settings saved locally', description: 'Connect to Supabase to sync settings.' });
    }
  }, [settings, supabaseClient, supabaseStatus]);
  
  const deleteAllData = useCallback(async () => {
    setRecords([]);
    setPendingSync([]);
    saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, []);
    saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, []);
    if (supabaseClient && supabaseStatus === 'connected') {
        try {
            const { error } = await supabaseClient.from('loom_records').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
            if (error) throw error;
        } catch (e) {
            toast({ title: 'Delete Failed', description: 'Could not delete records from Supabase.', variant: 'destructive' });
        }
    }
  }, [supabaseClient, supabaseStatus]);

  const value = {
    records,
    settings,
    addRecord,
    updateRecord,
    deleteRecord,
    updateSettings,
    deleteAllData,
    isInitialized,
    supabaseStatus,
    pendingSyncCount: pendingSync.length,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

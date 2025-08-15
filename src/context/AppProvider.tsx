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
  
  // Load initial data from localStorage
  useEffect(() => {
    setRecords(getFromLocalStorage<LoomRecord[]>(LOCAL_RECORDS_STORAGE_KEY, []));
    const localSettings = getFromLocalStorage<AppSettings>(LOCAL_SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
    setSettings(localSettings);
    setPendingSync(getFromLocalStorage<PendingSyncOperation[]>(PENDING_SYNC_STORAGE_KEY, []));
    setIsInitialized(true);
  }, []);

  // Persist pending sync operations to localStorage
  useEffect(() => {
    if (isInitialized) {
      saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, pendingSync);
    }
  }, [pendingSync, isInitialized]);

  // Function to initialize Supabase client
  const initializeSupabase = useCallback((url: string, key: string) => {
    if (!url || !key) {
        if (supabaseClient) {
            supabaseClient.removeAllChannels();
            setSupabaseClient(null);
            setSupabaseStatus('disconnected');
        }
        return;
    }
    if (supabaseClient && supabaseClient.supabaseUrl === url) return;

    setSupabaseStatus('reconnecting');
    const client = createClient(url, key);
    setSupabaseClient(client);
  }, [supabaseClient]);
  
  // Initialize or re-initialize Supabase when settings change
  useEffect(() => {
      if(isInitialized && settings.supabaseUrl && settings.supabaseKey) {
          initializeSupabase(settings.supabaseUrl, settings.supabaseKey);
      }
  }, [settings.supabaseUrl, settings.supabaseKey, isInitialized, initializeSupabase]);


  // Effect for handling real-time sync and subscriptions
  useEffect(() => {
    if (!supabaseClient) {
        if (recordsChannel.current) {
            recordsChannel.current.unsubscribe();
            recordsChannel.current = null;
        }
        if(settingsChannel.current) {
            settingsChannel.current.unsubscribe();
            settingsChannel.current = null;
        }
      return;
    }
    
    const processPending = async () => {
        if (pendingSync.length === 0) return;
        
        toast({title: `Syncing ${pendingSync.length} offline changes...`})

        const remainingOps: PendingSyncOperation[] = [];
        
        for (const op of pendingSync) {
            let success = false;
            try {
                if (op.type === 'add' || op.type === 'update') {
                    const { error } = await supabaseClient.from('loom_records').upsert(op.record);
                    if (error) throw error;
                } else if (op.type === 'delete') {
                    const { error } = await supabaseClient.from('loom_records').delete().eq('id', op.id);
                    if (error) throw error;
                }
                success = true;
            } catch (error) {
                console.error('Failed to sync pending operation:', op, error);
                remainingOps.push(op);
            }
        }
        setPendingSync(remainingOps);
        if(remainingOps.length === 0) {
            toast({ title: 'Sync complete!', description: 'All offline changes have been saved.' });
        } else {
            toast({ title: 'Sync failed', description: `${remainingOps.length} changes could not be synced.`, variant: 'destructive'})
        }
    };


    const setupSubscriptions = async () => {
        setInitialSyncComplete(false);
        setSupabaseStatus('reconnecting');
        
        try {
            // Fetch initial data
            const { data: initialRecords, error: recordsError } = await supabaseClient.from('loom_records').select('*');
            if (recordsError) throw recordsError;
            
            const localRecords = getFromLocalStorage<LoomRecord[]>(LOCAL_RECORDS_STORAGE_KEY, []);
            const remoteRecordsMap = new Map((initialRecords || []).map(r => [r.id, r]));
            const mergedRecords = localRecords.filter(lr => !remoteRecordsMap.has(lr.id)).concat(initialRecords || []);
            
            setRecords(mergedRecords);
            saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, mergedRecords);

            const { data: initialSettings, error: settingsError } = await supabaseClient.from('settings').select('*').eq('id', GLOBAL_SETTINGS_ID).limit(1).single();
            
            if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116: "object not found" -> ok
                throw settingsError;
            }
            
            if(initialSettings) {
                setSettings(prevSettings => {
                  const newSettings = { ...prevSettings, ...initialSettings, id: GLOBAL_SETTINGS_ID };
                  saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, newSettings);
                  return newSettings;
                });
            }

            setSupabaseStatus('connected');
            setInitialSyncComplete(true);
            toast({ title: "Connected to Supabase", description: "Data is live." });
            
            await processPending();

        } catch (error) {
            console.error('Initial fetch from Supabase failed:', error);
            setSupabaseStatus('disconnected');
            toast({ title: 'Connection Failed', description: 'Could not fetch data from Supabase.', variant: 'destructive' });
            return;
        }
        
        // Settings subscription
        if (settingsChannel.current) settingsChannel.current.unsubscribe();
        settingsChannel.current = supabaseClient.channel('settings-channel')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: `id=eq.${GLOBAL_SETTINGS_ID}` }, (payload) => {
                const newSettings = payload.new as AppSettings;
                setSettings(prevSettings => {
                  const updatedSettings = { ...prevSettings, ...newSettings };
                  saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, updatedSettings);
                  return updatedSettings;
                });
                toast({ title: 'Settings updated', description: 'Settings were updated from another device.' });
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') console.log('Subscribed to settings changes');
            });
        
        // Records subscription
        if (recordsChannel.current) recordsChannel.current.unsubscribe();
        recordsChannel.current = supabaseClient.channel('loom-records-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'loom_records' }, (payload) => {
                setRecords(currentRecords => {
                    let newRecords = [...currentRecords];
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        const newRecord = payload.new as LoomRecord;
                        const existingIndex = newRecords.findIndex(r => r.id === newRecord.id);
                        if (existingIndex > -1) {
                            newRecords[existingIndex] = newRecord; // Update
                        } else {
                            newRecords.push(newRecord); // Insert
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const oldRecord = payload.old as Partial<LoomRecord>;
                        newRecords = newRecords.filter(r => r.id !== oldRecord.id);
                    }
                    saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, newRecords);
                    return newRecords;
                });
            })
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    setSupabaseStatus('connected');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    setSupabaseStatus('disconnected');
                }
            });
    };

    setupSubscriptions();

    return () => {
      if (recordsChannel.current) supabaseClient.removeChannel(recordsChannel.current);
      if (settingsChannel.current) supabaseClient.removeChannel(settingsChannel.current);
    };
  }, [supabaseClient]);


  const syncOrQueue = async (op: PendingSyncOperation) => {
      if (supabaseStatus === 'connected' && supabaseClient && initialSyncComplete) {
          try {
              if (op.type === 'add' || op.type === 'update') {
                  const { error } = await supabaseClient.from('loom_records').upsert(op.record);
                  if (error) throw error;
              } else if (op.type === 'delete') {
                  const { error } = await supabaseClient.from('loom_records').delete().eq('id', op.id);
                  if (error) throw error;
              }
          } catch(e) {
              setPendingSync(prev => [...prev, op]);
              toast({ title: 'Sync failed', description: 'Saving change for later.', variant: 'destructive' });
          }
      } else {
          setPendingSync(prev => [...prev, op]);
      }
  }


  const addRecord = useCallback((record: Omit<LoomRecord, 'id'>) => {
    const newRecord: LoomRecord = { 
      ...record, 
      id: crypto.randomUUID(),
    };
    setRecords(prev => {
        const updated = [...prev, newRecord];
        saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, updated);
        return updated;
    });
    syncOrQueue({ type: 'add', record: newRecord });
  }, []);

  const updateRecord = useCallback((updatedRecord: LoomRecord) => {
    setRecords(prev => {
        const updated = prev.map(r => r.id === updatedRecord.id ? updatedRecord : r);
        saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, updated);
        return updated;
    });
    syncOrQueue({ type: 'update', record: updatedRecord });
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setRecords(prev => {
        const updated = prev.filter(r => r.id !== id);
        saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, updated);
        return updated;
    });
    syncOrQueue({ type: 'delete', id });
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, updatedSettings);
    
    if (supabaseStatus === 'connected' && supabaseClient) {
        try {
            const { supabaseKey, geminiApiKey, ...settingsToSave } = updatedSettings;
            const settingsWithId = { ...settingsToSave, id: GLOBAL_SETTINGS_ID };
            const { error } = await supabaseClient.from('settings').upsert(settingsWithId);
            if(error) throw error;
            toast({ title: 'Settings saved to Supabase.' });
        } catch(e) {
             console.error("Failed to save settings to Supabase:", e);
             toast({ title: 'Cloud Save Failed', description: 'Settings saved locally, but failed to save to Supabase.', variant: 'destructive'});
        }
    } else {
        toast({ title: 'Settings saved locally', description: 'Connect to Supabase to sync settings.' });
    }
  }, [settings, supabaseStatus, supabaseClient]);
  
  const deleteAllData = useCallback(async () => {
    if (supabaseStatus === 'connected' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('loom_records').select('id');
            if (error) throw error;
            const idsToDelete = data.map(r => r.id);
            if(idsToDelete.length > 0) {
              const { error: deleteError } = await supabaseClient.from('loom_records').delete().in('id', idsToDelete);
              if (deleteError) throw deleteError;
            }
        } catch (e) {
            toast({ title: 'Delete Failed', description: 'Could not delete records from Supabase.', variant: 'destructive' });
        }
    }
    setRecords([]);
    setPendingSync([]);
    saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, []);
    saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, []);
  }, [supabaseStatus, supabaseClient]);

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

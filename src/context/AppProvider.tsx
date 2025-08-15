
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
  const [isInitialized, setIsInitialized] = useState(false);
  const [records, setRecords] = useState<LoomRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [pendingSync, setPendingSync] = useState<PendingSyncOperation[]>([]);
  
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus>('disconnected');
  
  const recordsChannel = useRef<RealtimeChannel | null>(null);
  const settingsChannel = useRef<RealtimeChannel | null>(null);
  const isSyncing = useRef(false);
  const initialSyncComplete = useRef(false);

  // 1. Load initial data from localStorage on mount
  useEffect(() => {
    setRecords(getFromLocalStorage<LoomRecord[]>(LOCAL_RECORDS_STORAGE_KEY, []));
    setSettings(getFromLocalStorage<AppSettings>(LOCAL_SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS));
    setPendingSync(getFromLocalStorage<PendingSyncOperation[]>(PENDING_SYNC_STORAGE_KEY, []));
    setIsInitialized(true);
  }, []);

  // 2. Save pending sync operations to localStorage whenever they change
  useEffect(() => {
    if (isInitialized) {
      saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, pendingSync);
    }
  }, [pendingSync, isInitialized]);
  
  // 3. Initialize Supabase client when settings change
  useEffect(() => {
    if (!isInitialized) return;

    const { supabaseUrl, supabaseKey } = settings;
    if (supabaseUrl && supabaseKey) {
        if (!supabaseClient || supabaseClient.supabaseUrl !== supabaseUrl) {
            const client = createClient(supabaseUrl, supabaseKey, {
                realtime: { params: { eventsPerSecond: 10 } }
            });
            setSupabaseClient(client);
        }
    } else {
        if(supabaseClient) {
            supabaseClient.removeAllChannels().then(() => {
              setSupabaseClient(null);
              setSupabaseStatus('disconnected');
            });
        }
    }
  // We only want this to run when credentials change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.supabaseUrl, settings.supabaseKey, isInitialized]);


  // 4. Process Pending Queue
  const processPending = useCallback(async (client: SupabaseClient) => {
    if (isSyncing.current || pendingSync.length === 0) return;

    isSyncing.current = true;
    let opsToProcess = [...pendingSync];
    
    // Clear the pending state immediately, and re-add failed items
    setPendingSync([]); 
    
    let failedOps: PendingSyncOperation[] = [];

    for (const op of opsToProcess) {
      try {
        if (op.type === 'add' || op.type === 'update') {
           const { error } = await client.from('loom_records').upsert({
              ...op.record,
              stops: parseInt(op.record.stops as any, 10),
              weftMeter: parseFloat(op.record.weftMeter as any),
           }, { onConflict: 'id' });
           if (error) throw error;
        } else if (op.type === 'delete') {
           const { error } = await client.from('loom_records').delete().eq('id', op.id);
           if (error) throw error;
        }
      } catch (error) {
        console.error('Failed to sync pending operation:', op.type, (op as any).record?.id || op.id, error);
        failedOps.push(op);
      }
    }

    if (failedOps.length > 0) {
      setPendingSync(prev => [...failedOps, ...prev]); // Add failed ops back to the queue
      toast({ title: 'Sync Incomplete', description: `${failedOps.length} changes could not be synced. Will retry.`, variant: 'destructive' });
    }
    
    const successCount = opsToProcess.length - failedOps.length;
    if (successCount > 0) {
      toast({ title: 'Sync Complete', description: `${successCount} change(s) saved to the cloud.` });
    }

    isSyncing.current = false;
  }, [pendingSync]);

  // 5. Manage Supabase subscriptions and data fetching
  useEffect(() => {
    if (!supabaseClient || !isInitialized) {
      initialSyncComplete.current = false;
      return;
    }
    
    setSupabaseStatus('reconnecting');

    const initialFetch = async () => {
        try {
            const { data: initialSettings, error: settingsError } = await supabaseClient
                .from('settings').select('*').eq('id', GLOBAL_SETTINGS_ID).limit(1).single();
            
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
            toast({ title: "Cloud Connected", description: "Data is live and syncing." });
            initialSyncComplete.current = true;
        } catch (error) {
            console.error('Initial fetch from Supabase failed:', error);
            setSupabaseStatus('disconnected');
            toast({ title: 'Connection Failed', description: 'Could not fetch data from Supabase.', variant: 'destructive' });
            initialSyncComplete.current = false;
        }
    };

    initialFetch();

    // Setup realtime channels
    settingsChannel.current = supabaseClient.channel('settings-channel')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: `id=eq.${GLOBAL_SETTINGS_ID}` }, (payload) => {
            setSettings(prev => ({...prev, ...payload.new as AppSettings}));
        }).subscribe();
      
    recordsChannel.current = supabaseClient.channel('loom-records-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loom_records' }, (payload) => {
            // Avoid processing our own pending changes coming back from realtime
            if (isSyncing.current) return;
            
            setRecords(currentRecords => {
                let newRecords = [...currentRecords];
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    const newRecord = payload.new as LoomRecord;
                    const existingIndex = newRecords.findIndex(r => r.id === newRecord.id);
                    if (existingIndex > -1) {
                      newRecords[existingIndex] = newRecord;
                    } else {
                      newRecords.push(newRecord);
                    }
                } else if (payload.eventType === 'DELETE') {
                    const oldId = payload.old.id;
                    newRecords = newRecords.filter(r => r.id !== oldId);
                }
                saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, newRecords);
                return newRecords;
            });
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED' && supabaseStatus !== 'connected') {
                setSupabaseStatus('connected');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                if (supabaseStatus !== 'disconnected') setSupabaseStatus('disconnected');
            }
        });
      
    return () => {
      if (recordsChannel.current) supabaseClient.removeChannel(recordsChannel.current);
      if (settingsChannel.current) supabaseClient.removeChannel(settingsChannel.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseClient, isInitialized]);


  // 6. Effect to process pending queue when connection is restored
  useEffect(() => {
      if (supabaseStatus === 'connected' && initialSyncComplete.current && supabaseClient) {
          processPending(supabaseClient);
      }
  }, [supabaseStatus, supabaseClient, processPending]);

  const syncOrQueue = useCallback((op: PendingSyncOperation) => {
    setPendingSync(prev => {
        // For updates and deletes, remove any older pending operations for the same record
        let newPending = [...prev];
        if(op.type !== 'add') {
            const idToFind = op.type === 'delete' ? op.id : op.record.id;
            newPending = newPending.filter(p => {
                const p_id = p.type === 'delete' ? p.id : p.record.id;
                return p_id !== idToFind;
            });
        }
        return [...newPending, op];
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
            toast({ title: 'Settings saved to cloud.' });
        } catch(e) {
             console.error("Failed to save settings to Supabase:", e);
             toast({ title: 'Cloud Save Failed', description: 'Settings saved locally, but failed to save to Supabase.', variant: 'destructive'});
        }
    }
  }, [settings, supabaseClient, supabaseStatus]);
  
  const deleteAllData = useCallback(async () => {
    setRecords([]);
    setPendingSync([]);
    saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, []);
    saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, []);
    if (supabaseClient && supabaseStatus === 'connected') {
        try {
            const { error } = await supabaseClient.from('loom_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) throw error;
        } catch (e) {
            toast({ title: 'Delete Failed', description: 'Could not delete records from Supabase.', variant: 'destructive' });
        }
    }
  }, [supabaseClient, supabaseStatus]);

  return (
    <AppContext.Provider value={{
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
    }}>
      {children}
    </AppContext.Provider>
  );
};

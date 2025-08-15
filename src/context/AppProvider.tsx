
'use client';

import React, { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { LoomRecord, AppSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { getFromLocalStorage, saveToLocalStorage } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

const LOCAL_RECORDS_STORAGE_KEY = 'laxmi-shree-records-v2';
const LOCAL_SETTINGS_STORAGE_KEY = 'laxmi-shree-settings-v2';
const PENDING_SYNC_STORAGE_KEY = 'laxmi-shree-pending-sync-v2';
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
  const initialDataFetched = useRef(false);

  // 1. Load initial data from localStorage on mount
  useEffect(() => {
    const localRecords = getFromLocalStorage<LoomRecord[]>(LOCAL_RECORDS_STORAGE_KEY, []);
    const localSettings = getFromLocalStorage<AppSettings>(LOCAL_SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
    const localPending = getFromLocalStorage<PendingSyncOperation[]>(PENDING_SYNC_STORAGE_KEY, []);
    
    setRecords(localRecords);
    setSettings(localSettings);
    setPendingSync(localPending);
    setIsInitialized(true);
  }, []);
  
  // 2. Save records and pending sync to localStorage when they change
  useEffect(() => {
    if (isInitialized) {
      saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, records);
      saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, pendingSync);
    }
  }, [records, pendingSync, isInitialized]);

  // 3. Process pending queue when connected
  const processPending = useCallback(async (client: SupabaseClient) => {
    if (isSyncing.current || pendingSync.length === 0) return;
    isSyncing.current = true;
    
    const opsToProcess = [...pendingSync];
    let remainingOps: PendingSyncOperation[] = [];

    for (const op of opsToProcess) {
      try {
        if (op.type === 'add' || op.type === 'update') {
          const { error } = await client.from('loom_records').upsert({
            ...op.record,
            stops: parseInt(op.record.stops as any, 10),
            weft_meter: parseFloat(op.record.weftMeter as any),
          }, { onConflict: 'id' });
          if (error) throw error;
        } else if (op.type === 'delete') {
          const { error } = await client.from('loom_records').delete().eq('id', op.id);
          if (error) throw error;
        }
      } catch (error) {
        console.error('Failed to sync pending operation:', op.type, (op as any).record?.id || op.id, error);
        remainingOps.push(op);
      }
    }
    
    setPendingSync(remainingOps);
    isSyncing.current = false;
    
    if (remainingOps.length > 0 && opsToProcess.length !== remainingOps.length) {
      toast({ title: 'Sync Incomplete', description: `${remainingOps.length} changes could not be synced. Will retry.`, variant: 'destructive' });
    }
    
  }, [pendingSync]);


  // 4. Manage Supabase client and connection based on settings
  useEffect(() => {
    if (!isInitialized) return;
    
    const { supabaseUrl, supabaseKey } = settings;

    if (supabaseUrl && supabaseKey) {
        const client = createClient(supabaseUrl, supabaseKey);
        setSupabaseClient(client);

        const setupSubscriptions = async () => {
          setSupabaseStatus('reconnecting');
          
          try {
            if (!initialDataFetched.current) {
              // Fetch settings first
              const { data: initialSettings, error: settingsError } = await client
                .from('settings')
                .select('*')
                .eq('id', GLOBAL_SETTINGS_ID)
                .single();
              
              if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;

              const mergedSettings = { ...DEFAULT_SETTINGS, ...settings, ...initialSettings };
              setSettings(mergedSettings);
              saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, mergedSettings);

              // Fetch records
              const { data: initialRecords, error: recordsError } = await client.from('loom_records').select('*');
              if (recordsError) throw recordsError;

              // Merge local and remote records
              setRecords(prevLocalRecords => {
                const remoteRecordsMap = new Map((initialRecords || []).map(r => [r.id, r]));
                const localRecordsMap = new Map(prevLocalRecords.map(r => [r.id, r]));
                const merged = Array.from(new Map([...localRecordsMap, ...remoteRecordsMap]).values());
                saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, merged);
                return merged;
              });

              initialDataFetched.current = true;
            }

            // After initial fetch, process any pending offline changes
            await processPending(client);
            
            setSupabaseStatus('connected');
            toast({ title: "Cloud Connected", description: "Data is live and syncing." });
            
            // Subscribe to channels
            settingsChannel.current = client.channel('settings-channel')
              .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: `id=eq.${GLOBAL_SETTINGS_ID}` }, (payload) => {
                const newSettings = payload.new as AppSettings;
                setSettings(prev => {
                  const updated = { ...prev, ...newSettings };
                  saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, updated);
                  return updated;
                });
              }).subscribe();
            
            recordsChannel.current = client.channel('loom-records-channel')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'loom_records' }, (payload) => {
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
                  return newRecords; // The useEffect for saving will handle localStorage
                });
              }).subscribe();

          } catch (error) {
              console.error('Supabase connection or initial fetch failed:', error);
              setSupabaseStatus('disconnected');
              toast({ title: 'Connection Failed', description: 'Could not connect to Supabase.', variant: 'destructive' });
          }
        };

        setupSubscriptions();

        return () => {
          client.removeAllChannels();
          recordsChannel.current = null;
          settingsChannel.current = null;
          setSupabaseClient(null);
          setSupabaseStatus('disconnected');
          initialDataFetched.current = false; // Reset for next connection attempt
        };
    } else {
        setSupabaseClient(null);
        setSupabaseStatus('disconnected');
    }
  }, [isInitialized, settings.supabaseUrl, settings.supabaseKey, processPending]);
  
  // Effect to process pending queue whenever connection is established
  useEffect(() => {
    if (supabaseStatus === 'connected' && supabaseClient) {
      processPending(supabaseClient);
    }
  }, [supabaseStatus, supabaseClient, processPending]);


  const syncOrQueue = useCallback((op: PendingSyncOperation) => {
    setPendingSync(prev => {
        let newPending = [...prev];
        // For updates and deletes, remove any previous operations for the same record
        if (op.type !== 'add') {
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
    setRecords(prev => [...prev, newRecord]);
    syncOrQueue({ type: 'add', record: newRecord });
  }, [syncOrQueue]);

  const updateRecord = useCallback((updatedRecord: LoomRecord) => {
    setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
    syncOrQueue({ type: 'update', record: updatedRecord });
  }, [syncOrQueue]);

  const deleteRecord = useCallback((id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
    syncOrQueue({ type: 'delete', id });
  }, [syncOrQueue]);
  
  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, updatedSettings);
    
    if (supabaseClient && supabaseStatus === 'connected') {
        try {
            const settingsToSave = {
                id: GLOBAL_SETTINGS_ID,
                total_machines: updatedSettings.totalMachines,
                low_efficiency_threshold: updatedSettings.lowEfficiencyThreshold,
                whatsapp_number: updatedSettings.whatsAppNumber,
                message_template: updatedSettings.messageTemplate,
            };
            
            const { error } = await supabaseClient
                .from('settings')
                .upsert(settingsToSave, { onConflict: 'id' });

            if (error) throw error;
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

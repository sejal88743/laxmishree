
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
  
  const isSyncing = useRef(false);
  const initialDataFetched = useRef(false);
  const activeSyncIds = useRef(new Set<string>());

  // Load initial data from localStorage on mount
  useEffect(() => {
    const localRecords = getFromLocalStorage<LoomRecord[]>(LOCAL_RECORDS_STORAGE_KEY, []);
    const localSettings = getFromLocalStorage<AppSettings>(LOCAL_SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
    const localPending = getFromLocalStorage<PendingSyncOperation[]>(PENDING_SYNC_STORAGE_KEY, []);
    
    setRecords(localRecords);
    setSettings(localSettings);
    setPendingSync(localPending);
    setIsInitialized(true);
  }, []);
  
  // Save to localStorage when data changes
  useEffect(() => {
    if (isInitialized) {
      saveToLocalStorage(LOCAL_RECORDS_STORAGE_KEY, records);
      saveToLocalStorage(PENDING_SYNC_STORAGE_KEY, pendingSync);
      saveToLocalStorage(LOCAL_SETTINGS_STORAGE_KEY, settings);
    }
  }, [records, pendingSync, settings, isInitialized]);
  
  // Manage Supabase client based on settings
  useEffect(() => {
    if (!isInitialized) return;
    
    const { supabaseUrl, supabaseKey } = settings;

    if (supabaseUrl && supabaseKey) {
      const client = createClient(supabaseUrl, supabaseKey);
      setSupabaseClient(client);
      initialDataFetched.current = false;
    } else {
      setSupabaseClient(null);
    }
  }, [isInitialized, settings.supabaseUrl, settings.supabaseKey]);

  const processPending = useCallback(async (client: SupabaseClient) => {
    if (isSyncing.current || pendingSync.length === 0) return;
    isSyncing.current = true;

    const remainingOps = [...pendingSync];
    const successfulOps: PendingSyncOperation[] = [];

    for (const op of pendingSync) {
        const opId = (op as any).record?.id || op.id;
        if (activeSyncIds.current.has(opId)) continue;
        
        activeSyncIds.current.add(opId);

        try {
            if (op.type === 'add' || op.type === 'update') {
                const recordForSupabase = {
                    id: op.record.id,
                    date: op.record.date,
                    time: op.record.time,
                    shift: op.record.shift,
                    machine_no: op.record.machineNo,
                    stops: op.record.stops,
                    weft_meter: op.record.weftMeter,
                    total: op.record.total,
                    run: op.record.run,
                };
                const { error } = await client.from('loom_records').upsert(recordForSupabase, { onConflict: 'id' });
                if (error) throw error;
            } else if (op.type === 'delete') {
                const { error } = await client.from('loom_records').delete().eq('id', op.id);
                if (error) throw error;
            }
            successfulOps.push(op);
        } catch (error) {
            console.error('Failed to sync pending operation:', op.type, (op as any).record?.id || op.id, error);
        } finally {
            activeSyncIds.current.delete(opId);
        }
    }
    
    if (successfulOps.length > 0) {
      setPendingSync(currentPending => currentPending.filter(op => !successfulOps.includes(op)));
    }
    
    isSyncing.current = false;
    
  }, [pendingSync]);

  // Manage subscriptions and data fetching
  useEffect(() => {
    if (!supabaseClient) {
      setSupabaseStatus('disconnected');
      return;
    }

    let recordsChannel: RealtimeChannel | null = null;
    let settingsChannel: RealtimeChannel | null = null;

    const setupSubscriptions = async () => {
      setSupabaseStatus('reconnecting');
      
      try {
        if (!initialDataFetched.current) {
          // Fetch settings first
          const { data: initialSettings, error: settingsError } = await supabaseClient
            .from('settings')
            .select('total_machines, low_efficiency_threshold, whatsapp_number, message_template')
            .eq('id', GLOBAL_SETTINGS_ID)
            .single();
          
          if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;

          if (initialSettings) {
            setSettings(prev => ({
              ...prev,
              totalMachines: initialSettings.total_machines,
              lowEfficiencyThreshold: initialSettings.low_efficiency_threshold,
              whatsAppNumber: initialSettings.whatsapp_number,
              messageTemplate: initialSettings.message_template,
            }));
          }

          // Fetch records
          const { data: initialRecords, error: recordsError } = await supabaseClient.from('loom_records').select('*');
          if (recordsError) throw recordsError;

          const transformedRecords = initialRecords.map(r => ({
            ...r,
            machineNo: r.machine_no,
            weftMeter: r.weft_meter,
          }));

          setRecords(prevLocalRecords => {
            const remoteRecordsMap = new Map((transformedRecords || []).map(r => [r.id, r]));
            const localRecordsMap = new Map(prevLocalRecords.map(r => [r.id, r]));
            const merged = Array.from(new Map([...localRecordsMap, ...remoteRecordsMap]).values());
            return merged;
          });

          initialDataFetched.current = true;
        }

        await processPending(supabaseClient);
        
        setSupabaseStatus('connected');
        if (initialDataFetched.current) {
            toast({ title: "Cloud Connected", description: "Data is live and syncing." });
        }
        
        settingsChannel = supabaseClient.channel('settings-channel')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: `id=eq.${GLOBAL_SETTINGS_ID}` }, (payload) => {
            const newSettings = payload.new as any;
            setSettings(prev => ({
                ...prev,
                totalMachines: newSettings.total_machines,
                lowEfficiencyThreshold: newSettings.low_efficiency_threshold,
                whatsAppNumber: newSettings.whatsapp_number,
                messageTemplate: newSettings.message_template,
            }));
          }).subscribe();
        
        recordsChannel = supabaseClient.channel('loom-records-channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'loom_records' }, (payload) => {
            const recordId = (payload.new as LoomRecord)?.id || (payload.old as any)?.id;
            if (activeSyncIds.current.has(recordId)) return;

            setRecords(currentRecords => {
              let newRecords = [...currentRecords];
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const newRecord = {
                    ...(payload.new as any),
                    machineNo: payload.new.machine_no,
                    weftMeter: payload.new.weft_meter
                } as LoomRecord;
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
              return newRecords;
            });
          }).subscribe((status, err) => {
            if (err) {
              console.error('Subscription error', err);
              setSupabaseStatus('disconnected');
            }
          });

      } catch (error) {
          console.error('Supabase connection or initial fetch failed:', error);
          setSupabaseStatus('disconnected');
          toast({ title: 'Connection Failed', description: 'Could not connect to Supabase.', variant: 'destructive' });
      }
    };

    setupSubscriptions();
    
    return () => {
        if (recordsChannel) supabaseClient.removeChannel(recordsChannel);
        if (settingsChannel) supabaseClient.removeChannel(settingsChannel);
    };
  }, [supabaseClient, processPending]);
  
  useEffect(() => {
    if (!supabaseClient || supabaseStatus !== 'connected' || pendingSync.length === 0) return;
    
    const interval = setInterval(() => {
        processPending(supabaseClient);
    }, 15000); 

    return () => clearInterval(interval);
  }, [supabaseClient, supabaseStatus, pendingSync, processPending]);
  
  const syncOrQueue = useCallback((op: PendingSyncOperation) => {
    setPendingSync(prev => {
        let newPending = [...prev];
        const opId = (op as any).record?.id || op.id;

        // Remove any previous operations for the same record to avoid conflicts
        newPending = newPending.filter(p => (((p as any).record?.id || p.id) !== opId));

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
            toast({ title: 'All records deleted from cloud.' });
        } catch (e) {
            toast({ title: 'Cloud Delete Failed', description: 'Could not delete records from Supabase.', variant: 'destructive' });
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

    
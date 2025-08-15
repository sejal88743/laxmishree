'use client';

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { LoomRecord, AppSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { getFromLocalStorage, saveToLocalStorage } from '@/lib/storage';

const RECORDS_STORAGE_KEY = 'laxmi-shree-records';
const SETTINGS_STORAGE_KEY = 'laxmi-shree-settings';

export interface AppContextType {
  records: LoomRecord[];
  settings: AppSettings;
  addRecord: (record: Omit<LoomRecord, 'id'>) => void;
  updateRecord: (updatedRecord: LoomRecord) => void;
  deleteRecord: (id: string) => void;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  deleteAllData: () => void;
  isInitialized: boolean;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [records, setRecords] = useState<LoomRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setRecords(getFromLocalStorage<LoomRecord[]>(RECORDS_STORAGE_KEY, []));
    setSettings(getFromLocalStorage<AppSettings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS));
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      saveToLocalStorage(RECORDS_STORAGE_KEY, records);
    }
  }, [records, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      saveToLocalStorage(SETTINGS_STORAGE_KEY, settings);
    }
  }, [settings, isInitialized]);

  const addRecord = useCallback((record: Omit<LoomRecord, 'id'>) => {
    setRecords(prev => [...prev, { ...record, id: new Date().toISOString() }]);
  }, []);

  const updateRecord = useCallback((updatedRecord: LoomRecord) => {
    setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
  }, []);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);
  
  const deleteAllData = useCallback(() => {
    setRecords([]);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = {
    records,
    settings,
    addRecord,
    updateRecord,
    deleteRecord,
    updateSettings,
    deleteAllData,
    isInitialized
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

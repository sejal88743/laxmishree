'use client';

import { useContext } from 'react';
import { AppContext, AppContextType } from '@/context/AppProvider';

export const useAppState = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
};

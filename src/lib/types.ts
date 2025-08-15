export interface LoomRecord {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  shift: 'Day' | 'Night';
  machineNo: string;
  stops: number;
  weftMeter: number;
  total: string; // HH:MM:SS
  run: string; // HH:MM:SS
}

export interface CalculatedLoomRecord extends LoomRecord {
  efficiency: number;
  hr: number; // Weft Meter / Run Time in hours
  diff: string; // Total - Run
}

export interface AppSettings {
  totalMachines: number;
  lowEfficiencyThreshold: number;
  geminiApiKey: string;
  whatsAppNumber: string;
  messageTemplate: string;
  supabaseUrl: string;
  supabaseKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  totalMachines: 10,
  lowEfficiencyThreshold: 90,
  geminiApiKey: '',
  whatsAppNumber: '',
  messageTemplate: 'Record Details:\nDate: {{date}}\nTime: {{time}}\nShift: {{shift}}\nMachine: {{machineNo}}\nEfficiency: {{efficiency}}%',
  supabaseUrl: '',
  supabaseKey: '',
};

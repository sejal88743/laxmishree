import type { LoomRecord, CalculatedLoomRecord } from './types';

export const timeToSeconds = (time: string): number => {
  if (!time || typeof time !== 'string') return 0;
  const parts = time.split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    // try HH:MM
    if (parts.length === 2 && !parts.some(isNaN)) {
      return parts[0] * 3600 + parts[1] * 60;
    }
    return 0;
  };
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

export const secondsToTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00:00';
  const totalSeconds = Math.round(seconds);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const calculateEfficiency = (runSeconds: number, totalSeconds: number): number => {
  if (totalSeconds === 0) return 0;
  return (runSeconds / totalSeconds) * 100;
};

export const calculateHr = (weftMeter: number, runSeconds: number): number => {
  if (runSeconds === 0) return 0;
  const runHours = runSeconds / 3600;
  return weftMeter / runHours;
};

export const processRecord = (record: LoomRecord): CalculatedLoomRecord => {
  const runSeconds = timeToSeconds(record.run);
  const totalSeconds = timeToSeconds(record.total);

  const efficiency = calculateEfficiency(runSeconds, totalSeconds);
  const hr = calculateHr(record.weftMeter, runSeconds);
  const diff = secondsToTime(totalSeconds - runSeconds);

  return {
    ...record,
    efficiency,
    hr,
    diff,
  };
};

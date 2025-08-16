'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TFoot } from '@/components/ui/table';
import { Calendar as CalendarIcon, Printer, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useAppState } from '@/hooks/use-app-state';
import { processRecord } from '@/lib/calculations';
import type { CalculatedLoomRecord } from '@/lib/types';

type SortKey = keyof CalculatedLoomRecord | 'lossPrd';
type SortDirection = 'asc' | 'desc';

export default function ReportPage() {
  const { records, settings } = useAppState();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 7)),
    to: new Date(),
  });
  const [machineFilter, setMachineFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'Day' | 'Night'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);

  const componentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
  });

  const filteredRecords = useMemo(() => {
    let filtered = records
      .filter(r => {
        const recordDate = new Date(r.date);
        const from = dateRange?.from ? new Date(dateRange.from.setHours(0,0,0,0)) : null;
        const to = dateRange?.to ? new Date(dateRange.to.setHours(23,59,59,999)) : null;
        
        const isDateInRange = (!from || recordDate >= from) && (!to || recordDate <= to);
        const isMachineMatch = machineFilter === 'all' || r.machineNo === machineFilter;
        const isShiftMatch = shiftFilter === 'all' || r.shift === shiftFilter;
        
        return isDateInRange && isMachineMatch && isShiftMatch;
      })
      .map(processRecord);
    
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
          const aValue = a[sortConfig.key as keyof CalculatedLoomRecord];
          const bValue = b[sortConfig.key as keyof CalculatedLoomRecord];

          if (aValue < bValue) {
              return sortConfig.direction === 'asc' ? -1 : 1;
          }
          if (aValue > bValue) {
              return sortConfig.direction === 'asc' ? 1 : -1;
          }
          return 0;
      });
    }

    return filtered;

  }, [records, dateRange, machineFilter, shiftFilter, sortConfig]);

  const groupedRecords = useMemo(() => {
    const groups: { [date: string]: CalculatedLoomRecord[] } = {};
    filteredRecords.forEach(record => {
      const date = record.date;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(record);
    });
    return Object.entries(groups).sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime());
  }, [filteredRecords]);

  const machineOptions = ['all', ...Array.from({ length: settings.totalMachines || 0 }, (_, i) => (i + 1).toString())];

  const grandTotalWeft = useMemo(() => filteredRecords.reduce((sum, r) => sum + r.weftMeter, 0), [filteredRecords]);
  const grandTotalLossPrd = useMemo(() => filteredRecords.reduce((sum, r) => sum + r.lossPrd, 0), [filteredRecords]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
        return <ArrowUpDown className="ml-2 h-3 w-3" />;
    }
    return sortConfig.direction === 'asc' ? '▲' : '▼';
  }

  const renderTableForShift = (data: CalculatedLoomRecord[], shift: 'Day' | 'Night') => {
    const shiftData = data.filter(r => r.shift === shift);
    if(shiftData.length === 0) return null;

    const totalWeft = shiftData.reduce((sum, r) => sum + r.weftMeter, 0);
    const totalLossPrd = shiftData.reduce((sum, r) => sum + r.lossPrd, 0);
    
    const tableHeaders: { key: SortKey; label: string; }[] = [
        { key: 'time', label: 'Time' },
        { key: 'machineNo', label: 'M/C' },
        { key: 'stops', label: 'Stops' },
        { key: 'weftMeter', label: 'Weft' },
        { key: 'efficiency', label: 'Eff(%)' },
        { key: 'lossPrd', label: 'Loss Prd' }
    ];

    return (
        <div className="mb-4 print-card">
            <h4 className="font-semibold text-sm mb-1 text-primary">{shift} Shift</h4>
            <Table className="text-xs print-table">
                <TableHeader>
                    <TableRow>
                        {tableHeaders.map(({ key, label }) => (
                            <TableHead key={key}>
                                <Button variant="ghost" onClick={() => requestSort(key)} className="p-0 h-auto text-xs font-bold hover:bg-transparent no-print">
                                    {label} {getSortIcon(key)}
                                </Button>
                                <span className="print-only">{label}</span>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {shiftData.map(r => (
                        <TableRow key={r.id}>
                            <TableCell>{r.time}</TableCell>
                            <TableCell>{r.machineNo}</TableCell>
                            <TableCell>{r.stops}</TableCell>
                            <TableCell>{r.weftMeter.toFixed(1)}</TableCell>
                            <TableCell>{r.efficiency.toFixed(2)}</TableCell>
                            <TableCell>{r.lossPrd.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TFoot>
                    <TableRow>
                        <TableCell colSpan={3} className="font-bold">Total</TableCell>
                        <TableCell className="font-bold">{totalWeft.toFixed(2)}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="font-bold">{totalLossPrd.toFixed(2)}</TableCell>
                    </TableRow>
                </TFoot>
            </Table>
        </div>
    );
  }

  return (
    <div className="p-2 space-y-4">
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-primary">Generate Report</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium">Date Range</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button id="date" variant="outline" className="w-full justify-start text-left font-normal bg-card">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'dd/MM/yy')} - ${format(dateRange.to, 'dd/MM/yy')}` : format(dateRange.from, 'dd/MM/yy')) : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-sm font-medium">Machine</label>
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {machineOptions.map(opt => <SelectItem key={opt} value={opt}>{opt === 'all' ? 'All Machines' : `Machine ${opt}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Shift</label>
            <Select value={shiftFilter} onValueChange={(val: 'all'|'Day'|'Night') => setShiftFilter(val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both Shifts</SelectItem>
                <SelectItem value="Day">Day</SelectItem>
                <SelectItem value="Night">Night</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handlePrint} className="w-full bg-accent hover:bg-accent/90">
              <Printer className="mr-2 h-4 w-4" /> Print Report
            </Button>
          </div>
        </CardContent>
      </Card>

      <div ref={componentRef} className="print-container">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-xl font-bold text-primary">Laxmi Shree Efficiency Report</CardTitle>
            <p className="text-center text-sm text-muted-foreground">
              {dateRange?.from && format(dateRange.from, 'dd/MM/yyyy')} - {dateRange?.to && format(dateRange.to, 'dd/MM/yyyy')}
            </p>
             <div className="text-center text-sm text-muted-foreground">
              {machineFilter !== 'all' && `Machine: ${machineFilter}`} {shiftFilter !== 'all' && `Shift: ${shiftFilter}`}
             </div>
          </CardHeader>
          <CardContent>
            {groupedRecords.map(([date, dateRecords]) => (
              <div key={date} className="mb-6">
                <h3 className="text-lg font-bold my-2 p-2 bg-muted rounded-md">{format(new Date(date), 'EEEE, dd MMMM yyyy')}</h3>
                {renderTableForShift(dateRecords, 'Day')}
                {renderTableForShift(dateRecords, 'Night')}
              </div>
            ))}
             {groupedRecords.length === 0 && <p className="text-center text-muted-foreground">No records found for the selected filters.</p>}
          </CardContent>
          <CardFooter className="flex justify-end flex-wrap gap-4">
              <div className="text-lg font-bold text-primary p-2 rounded-md bg-primary/10">
                  Grand Total Loss Prd: {grandTotalLossPrd.toFixed(2)}
              </div>
              <div className="text-lg font-bold text-primary p-2 rounded-md bg-primary/10">
                  Grand Total Weft Meter: {grandTotalWeft.toFixed(2)}
              </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

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
import { format, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useAppState } from '@/hooks/use-app-state';
import { processRecord } from '@/lib/calculations';
import type { CalculatedLoomRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

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
     pageStyle: `
      @page {
        size: A4;
        margin: 0.5in;
      }
    `
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

  const tableHeaders: { key: SortKey; label: string; className: string }[] = [
      { key: 'date', label: 'Date', className: 'text-gray-700' },
      { key: 'time', label: 'Time', className: 'text-gray-700' },
      { key: 'machineNo', label: 'M/C', className: 'text-purple-600' },
      { key: 'stops', label: 'Stops', className: 'text-orange-600' },
      { key: 'weftMeter', label: 'Weft', className: 'text-teal-600' },
      { key: 'efficiency', label: 'Eff(%)', className: 'text-green-600' },
      { key: 'total', label: 'Total', className: 'text-gray-700' },
      { key: 'run', label: 'Run', className: 'text-gray-700' },
      { key: 'diff', label: 'Diff', className: 'text-pink-600' },
      { key: 'lossPrd', label: 'LossPrd', className: 'text-red-700' }
  ];
  
  const cellPadding = "p-1";


  const renderTableForShift = (data: CalculatedLoomRecord[], shift: 'Day' | 'Night') => {
    const shiftData = data.filter(r => r.shift === shift);
    if(shiftData.length === 0) return <div className="w-1/2 p-1"><Card className='h-full'><CardContent className='flex items-center justify-center h-full text-muted-foreground'>No records for {shift} shift</CardContent></Card></div>;

    const totalWeft = shiftData.reduce((sum, r) => sum + r.weftMeter, 0);
    const totalLossPrd = shiftData.reduce((sum, r) => sum + r.lossPrd, 0);
    
    return (
        <div className="w-1/2 p-1 print-card">
            <h4 className="font-semibold text-center text-sm mb-1 text-primary">{shift} Shift</h4>
            <Table className="text-[10px] print-table">
                <TableHeader>
                    <TableRow>
                        {tableHeaders.map(({ key, label }) => (
                            <TableHead key={key} className={cellPadding}>
                                <Button variant="ghost" onClick={() => requestSort(key)} className="p-0 h-auto text-[10px] font-bold hover:bg-transparent no-print">
                                    {label} {getSortIcon(key)}
                                </Button>
                                <span className="print-only font-bold">{label}</span>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {shiftData.map(r => (
                        <TableRow key={r.id} className="font-bold">
                            <TableCell className={cn(cellPadding, 'text-gray-700')}>{format(parseISO(r.date), 'dd/MM')}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-gray-700')}>{r.time}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-purple-600')}>{r.machineNo}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-orange-600')}>{r.stops}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-teal-600')}>{r.weftMeter.toFixed(1)}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-green-600')}>{r.efficiency.toFixed(2)}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-gray-700')}>{r.total}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-gray-700')}>{r.run}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-pink-600')}>{r.diff}</TableCell>
                            <TableCell className={cn(cellPadding, 'text-red-700')}>{r.lossPrd.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TFoot>
                    <TableRow className="font-bold bg-primary/10 text-primary">
                        <TableCell colSpan={4} className={cellPadding}>Total</TableCell>
                        <TableCell className={cellPadding}>{totalWeft.toFixed(2)}</TableCell>
                        <TableCell colSpan={4}></TableCell>
                        <TableCell className={cellPadding}>{totalLossPrd.toFixed(2)}</TableCell>
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
            <div onClick={handlePrint} className="w-full">
                <Button className="w-full bg-accent hover:bg-accent/90">
                <Printer className="mr-2 h-4 w-4" /> Print Report
                </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div ref={componentRef} className="print-container">
        <Card>
          <CardHeader className='p-2'>
            <CardTitle className="text-center text-xl font-bold text-primary">Laxmi Shree Efficiency Report</CardTitle>
            <p className="text-center text-sm text-muted-foreground">
              {dateRange?.from && format(dateRange.from, 'dd/MM/yyyy')} - {dateRange?.to && format(dateRange.to, 'dd/MM/yyyy')}
            </p>
             <div className="text-center text-sm text-muted-foreground">
              {machineFilter !== 'all' && `Machine: ${machineFilter}`} {shiftFilter !== 'all' && `Shift: ${shiftFilter}`}
             </div>
          </CardHeader>
          <CardContent className='p-2'>
            {groupedRecords.map(([date, dateRecords]) => (
              <div key={date} className="mb-4 p-2 border rounded-md">
                <h3 className="text-lg text-center font-bold my-1 p-1 bg-muted rounded-md">{format(parseISO(date), 'EEEE, dd MMMM yyyy')}</h3>
                <div className="flex -m-1">
                    {renderTableForShift(dateRecords, 'Day')}
                    {renderTableForShift(dateRecords, 'Night')}
                </div>
              </div>
            ))}
             {groupedRecords.length === 0 && <p className="text-center text-muted-foreground py-10">No records found for the selected filters.</p>}
          </CardContent>
          <CardFooter className="flex justify-end flex-wrap gap-4 p-2">
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

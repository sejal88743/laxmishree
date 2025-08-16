'use client';

import React, { useState, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TFoot } from '@/components/ui/table';
import { Calendar as CalendarIcon, Download, ArrowUpDown, Loader2 } from 'lucide-react';
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
  const [isGenerating, setIsGenerating] = useState(false);

  const componentRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    const reportElement = componentRef.current;
    if (!reportElement) return;

    setIsGenerating(true);
    
    reportElement.classList.add('pdf-generation');

    const canvas = await html2canvas(reportElement, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        logging: false,
    });
    
    reportElement.classList.remove('pdf-generation');
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Calculate the aspect ratio
    const ratio = canvasWidth / canvasHeight;
    let imgHeight = pdfWidth / ratio;
    
    // If the content is taller than the page, it needs to be split
    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    // Add new pages if content is longer than one page
    while (heightLeft > 0) {
      position = heightLeft - imgHeight; // Set top of image for the new page
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    const fromDate = dateRange?.from ? format(dateRange.from, 'dd-MM-yy') : 'start';
    const toDate = dateRange?.to ? format(dateRange.to, 'dd-MM-yy') : 'end';
    pdf.save(`Laxmi_Shree_Report_${fromDate}_to_${toDate}.pdf`);
    setIsGenerating(false);
  };


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
    if(shiftData.length === 0) return <div className="w-full p-1 print-card"><Card className='h-full'><CardContent className='flex items-center justify-center h-full text-muted-foreground'>No records for {shift} shift</CardContent></Card></div>;

    const totalWeft = shiftData.reduce((sum, r) => sum + r.weftMeter, 0);
    const totalLossPrd = shiftData.reduce((sum, r) => sum + r.lossPrd, 0);
    
    return (
        <div className="w-full p-1 print-card">
            <h4 className="font-semibold text-center text-sm mb-1 text-primary">{shift} Shift</h4>
            <Table className="text-[10px] print-table">
                <TableHeader>
                    <TableRow className="no-print">
                        {tableHeaders.map(({ key, label }) => (
                            <TableHead key={key} className={cn(cellPadding)}>
                                <Button variant="ghost" onClick={() => requestSort(key)} className="p-0 h-auto text-[10px] font-bold hover:bg-transparent">
                                    {label} {getSortIcon(key)}
                                </Button>
                            </TableHead>
                        ))}
                    </TableRow>
                     <TableRow className='print-only'>
                        {tableHeaders.map(({ key, label }) => (
                            <TableHead key={`${key}-print`} className={cn(cellPadding, 'font-bold')}>{label}</TableHead>
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
            <Button onClick={handleDownloadPdf} className="w-full bg-accent hover:bg-accent/90" disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {isGenerating ? 'Generating PDF...' : 'Download PDF'}
            </Button>
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
                <div className="flex -m-1 print-shifts-container">
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

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TFoot } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Calendar as CalendarIcon, PlusCircle, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { useAppState } from '@/hooks/use-app-state';
import { processRecord } from '@/lib/calculations';
import type { CalculatedLoomRecord } from '@/lib/types';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { cn } from '@/lib/utils';

type SortKey = keyof CalculatedLoomRecord | 'lossPrd';
type SortDirection = 'asc' | 'desc';

export default function EfficiencyPage() {
  const { records, deleteRecord, settings } = useAppState();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsedDate = parse(dateParam, 'yyyy-MM-dd', new Date());
      if (isValid(parsedDate)) {
        setSelectedDate(parsedDate);
      }
    }
  }, [searchParams]);

  const handleWhatsAppShare = (record: CalculatedLoomRecord) => {
    if (!settings.whatsAppNumber) {
        alert("Please set a WhatsApp number in settings.");
        return;
    }
    let message = settings.messageTemplate || 'Record Details:\nDate: {{date}}\nTime: {{time}}\nShift: {{shift}}\nMachine: {{machineNo}}\nEfficiency: {{efficiency}}%';
    message = message.replace('{{date}}', format(new Date(record.date), 'dd/MM/yyyy'))
                     .replace('{{time}}', record.time)
                     .replace('{{shift}}', record.shift)
                     .replace('{{machineNo}}', record.machineNo)
                     .replace('{{efficiency}}', record.efficiency.toFixed(2));
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${settings.whatsAppNumber}?text=${encodedMessage}`);
  };

  const filteredAndSortedRecords = useMemo(() => {
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    let filtered = records
      .filter(r => r.date === dateString)
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
  }, [records, selectedDate, sortConfig]);

  const dayShiftRecords = filteredAndSortedRecords.filter(r => r.shift === 'Day');
  const nightShiftRecords = filteredAndSortedRecords.filter(r => r.shift === 'Night');

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
        return null;
    }
    return sortConfig.direction === 'asc' ? <span className="ml-1 text-xs">▲</span> : <span className="ml-1 text-xs">▼</span>;
  }


  const cellPadding = "p-1";

  const renderRecordsTable = (title: string, data: CalculatedLoomRecord[]) => {
    
    const totalWeft = data.reduce((sum, r) => sum + r.weftMeter, 0);
    const totalLossPrd = data.reduce((sum, r) => sum + r.lossPrd, 0);

    const tableHeaders: { key: SortKey; label: string; className?: string }[] = [
        { key: 'time', label: 'Time', className: 'text-gray-700' },
        { key: 'machineNo', label: 'M/C', className: 'text-purple-600' },
        { key: 'stops', label: 'Stops', className: 'text-orange-600' },
        { key: 'weftMeter', label: 'Weft', className: 'text-teal-600' },
        { key: 'total', label: 'Total', className: 'text-gray-700' },
        { key: 'run', label: 'Run', className: 'text-gray-700' },
        { key: 'efficiency', label: 'Eff(%)', className: 'text-green-600' },
        { key: 'hr', label: 'H/R', className: 'text-indigo-600' },
        { key: 'diff', label: 'Diff', className: 'text-pink-600' },
        { key: 'lossPrd', label: 'Loss Prd', className: 'text-red-700' }
    ];

    return (
    <Card>
      <CardHeader className="p-2">
        <CardTitle className="text-primary text-xs font-bold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                {tableHeaders.map(({ key, label }) => (
                    <TableHead key={key} className={cellPadding}>
                        <Button variant="ghost" onClick={() => requestSort(key)} className="p-0 h-auto text-xs font-bold hover:bg-transparent">
                            {label} {getSortIcon(key)}
                        </Button>
                    </TableHead>
                ))}
                <TableHead className={cellPadding}>Act</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(record => (
                <TableRow key={record.id} className="font-bold">
                  <TableCell className={cn(cellPadding, 'text-gray-700')}>{record.time}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-purple-600')}>{record.machineNo}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-orange-600')}>{record.stops}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-teal-600')}>{record.weftMeter.toFixed(1)}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-gray-700')}>{record.total}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-gray-700')}>{record.run}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-green-600')}>{record.efficiency.toFixed(2)}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-indigo-600')}>{record.hr.toFixed(2)}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-pink-600')}>{record.diff}</TableCell>
                  <TableCell className={cn(cellPadding, 'text-red-700')}>{record.lossPrd.toFixed(2)}</TableCell>
                  <TableCell className={cellPadding}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => handleWhatsAppShare(record)}>
                          <WhatsAppIcon className="mr-2 h-4 w-4" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    <Trash2 className="mr-2 h-4 w-4 text-destructive" /> Delete
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the record.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteRecord(record.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TFoot>
                <TableRow className='font-bold text-primary bg-primary/10'>
                    <TableCell colSpan={3} className={cellPadding}>Total</TableCell>
                    <TableCell className={cellPadding}>{totalWeft.toFixed(2)}</TableCell>
                    <TableCell colSpan={5} className={cellPadding}></TableCell>
                    <TableCell className={cellPadding}>{totalLossPrd.toFixed(2)}</TableCell>
                    <TableCell className={cellPadding}></TableCell>
                </TableRow>
            </TFoot>
          </Table>
        </div>
      </CardContent>
    </Card>
    );
    }

  return (
    <div className="p-2 space-y-4">
      <div className="flex justify-between items-center gap-2">
        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal bg-card">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, 'dd/MM/yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                  if(date) setSelectedDate(date);
                  setIsDatePickerOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Button asChild className="bg-accent hover:bg-accent/90 shrink-0">
          <Link href="/efficiency/add">
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Record
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        {renderRecordsTable('Day Shift', dayShiftRecords)}
        {renderRecordsTable('Night Shift', nightShiftRecords)}
      </div>
    </div>
  );
}

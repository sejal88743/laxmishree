'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Calendar as CalendarIcon, PlusCircle, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAppState } from '@/hooks/use-app-state';
import { processRecord } from '@/lib/calculations';
import type { CalculatedLoomRecord } from '@/lib/types';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { cn } from '@/lib/utils';

export default function EfficiencyPage() {
  const { records, deleteRecord, settings } = useAppState();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
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

  const filteredRecords = useMemo(() => {
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    return records
      .filter(r => r.date === dateString)
      .map(processRecord)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [records, selectedDate]);

  const dayShiftRecords = filteredRecords.filter(r => r.shift === 'Day');
  const nightShiftRecords = filteredRecords.filter(r => r.shift === 'Night');

  const renderRecordsTable = (title: string, data: CalculatedLoomRecord[]) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Shift</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>M/C</TableHead>
                <TableHead>Stops</TableHead>
                <TableHead>Weft</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Eff(%)</TableHead>
                <TableHead>H/R</TableHead>
                <TableHead>Diff</TableHead>
                <TableHead>Act</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(record => (
                <TableRow key={record.id} className={cn(
                  'font-bold',
                  record.shift === 'Day' && 'text-blue-600',
                  record.shift === 'Night' && 'text-red-600'
                )}>
                  <TableCell>{record.shift}</TableCell>
                  <TableCell>{record.time}</TableCell>
                  <TableCell>{record.machineNo}</TableCell>
                  <TableCell>{record.stops}</TableCell>
                  <TableCell>{record.weftMeter.toFixed(1)}</TableCell>
                  <TableCell>{record.total}</TableCell>
                  <TableCell>{record.run}</TableCell>
                  <TableCell>{record.efficiency.toFixed(2)}</TableCell>
                  <TableCell>{record.hr.toFixed(2)}</TableCell>
                  <TableCell>{record.diff}</TableCell>
                  <TableCell>
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
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-2 space-y-4">
      <div className="flex justify-between items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal bg-card">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
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

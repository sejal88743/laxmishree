'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState } from '@/hooks/use-app-state';
import { scanLoomDisplay } from '@/ai/flows/scan-loom-display';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Upload, Camera, Save, Loader2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { LoomRecord } from '@/lib/types';

const formSchema = z.object({
  date: z.date({ required_error: 'A date is required.' }),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  shift: z.enum(['Day', 'Night'], { required_error: 'Shift is required.' }),
  machineNo: z.string().min(1, 'Machine No. is required.'),
  stops: z.coerce.number().min(0, 'Stops must be a positive number.'),
  weftMeter: z.coerce.number().min(0, 'Weft Meter must be a positive number.'),
  total: z.string().regex(/^([0-9\s]+):([0-5]\d):([0-5]\d)$/, 'Invalid time format (HH:MM:SS)'),
  run: z.string().regex(/^([0-9\s]+):([0-5]\d):([0-5]\d)$/, 'Invalid time format (HH:MM:SS)'),
});

export default function AddEfficiencyRecordPage() {
  const router = useRouter();
  const { addRecord, settings } = useAppState();
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      time: format(new Date(), 'HH:mm'),
      shift: 'Day',
      machineNo: '',
      stops: 0,
      weftMeter: 0,
      total: '00:00:00',
      run: '00:00:00',
    },
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const photoDataUri = e.target?.result as string;
        if (!photoDataUri) {
          toast({ variant: 'destructive', title: 'Error', description: 'Could not read file.' });
          return;
        }

        const result = await scanLoomDisplay({ photoDataUri });

        const valuesToSet: Partial<z.infer<typeof formSchema>> = {};
        if (result.date) {
            const [day, month, year] = result.date.split('/');
            if(day && month && year) {
                valuesToSet.date = new Date(`${year}-${month}-${day}`);
            }
        }
        if (result.time) valuesToSet.time = result.time;
        if (result.shift && (result.shift === 'Day' || result.shift === 'Night')) valuesToSet.shift = result.shift;
        if (result.machineNo) valuesToSet.machineNo = result.machineNo;
        if (result.stops) valuesToSet.stops = parseInt(result.stops, 10);
        if (result.weftMeter) valuesToSet.weftMeter = parseFloat(result.weftMeter);
        if (result.total) valuesToSet.total = result.total;
        if (result.run) valuesToSet.run = result.run;
        
        form.reset({ ...form.getValues(), ...valuesToSet });

        toast({ title: 'Scan Complete', description: 'Form has been pre-filled.' });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Scan failed:', error);
      toast({ variant: 'destructive', title: 'Scan Failed', description: 'Could not extract data from the image.' });
    } finally {
      setIsScanning(false);
      // Reset file input
      if(event.target) event.target.value = '';
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const record: Omit<LoomRecord, 'id'> = {
      ...values,
      date: format(values.date, 'yyyy-MM-dd'),
    };
    addRecord(record);
    toast({ title: 'Record Saved!', description: `Record for Machine ${values.machineNo} has been added.` });
    
    // Reset form but keep date and machine number
    const keptValues = { date: values.date, machineNo: values.machineNo, shift: values.shift };
    form.reset({
        ...form.formState.defaultValues,
        ...keptValues,
        time: format(new Date(), 'HH:mm'),
        stops: 0,
        weftMeter: 0,
        total: '00:00:00',
        run: '00:00:00',
    });
  };

  const machineOptions = Array.from({ length: settings.totalMachines || 0 }, (_, i) => (i + 1).toString());

  return (
    <div className="p-2">
      <Card className="m-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-primary">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft />
            </Button>
            Add New Record
          </CardTitle>
          <div className="flex gap-2">
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isScanning}>
              {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload
            </Button>
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isScanning}>
              {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Scan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                              {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time</FormLabel>
                      <FormControl><Input type="time" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shift"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shift</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Day">Day</SelectItem>
                          <SelectItem value="Night">Night</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="machineNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Machine No.</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select machine" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {machineOptions.map(num => <SelectItem key={num} value={num}>{num}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stops"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stops</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weftMeter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weft Meter</FormLabel>
                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Time</FormLabel>
                      <FormControl><Input placeholder="HH:MM:SS" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="run"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Run Time</FormLabel>
                      <FormControl><Input placeholder="HH:MM:SS" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                <Save className="mr-2 h-4 w-4" /> Save Record
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

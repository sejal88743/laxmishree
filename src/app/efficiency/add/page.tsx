'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState } from '@/hooks/use-app-state';
import { scanLoomDisplay } from '@/ai/flows/scan-loom-display';
import { processRecord } from '@/lib/calculations';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const { records, addRecord, settings } = useAppState();
  const [isScanning, setIsScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      time: format(new Date(), 'HH:mm'),
      shift: 'Day',
      stops: 0,
      weftMeter: 0,
      total: '00:00:00',
      run: '00:00:00',
    },
  });

  const watchedDate = useWatch({ control: form.control, name: 'date' });
  const watchedShift = useWatch({ control: form.control, name: 'shift' });

  const recentRecords = useMemo(() => {
    if (!watchedDate || !watchedShift) return [];
    const dateString = format(watchedDate, 'yyyy-MM-dd');
    return records
      .filter(r => r.date === dateString && r.shift === watchedShift)
      .map(processRecord)
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 5);
  }, [records, watchedDate, watchedShift]);

  useEffect(() => {
    if (!showCamera) return;
    const getCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to use this app.',
        });
        setShowCamera(false);
      }
    };

    getCameraPermission();
    
    return () => {
        if(videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    }
  }, [showCamera]);


  const processScanResult = (result: Awaited<ReturnType<typeof scanLoomDisplay>>) => {
    const valuesToSet: Partial<Omit<z.infer<typeof formSchema>, 'date'>> = {};
    if (result.time) valuesToSet.time = result.time;
    if (result.shift) {
        if (result.shift.toUpperCase() === 'A') valuesToSet.shift = 'Day';
        if (result.shift.toUpperCase() === 'B') valuesToSet.shift = 'Night';
    }
    if (result.machineNo) valuesToSet.machineNo = result.machineNo;
    if (result.stops) valuesToSet.stops = parseInt(result.stops, 10);
    if (result.weftMeter) valuesToSet.weftMeter = parseFloat(result.weftMeter);
    if (result.total) valuesToSet.total = result.total;
    if (result.run) valuesToSet.run = result.run;
    
    // Keep the manually selected date
    const currentValues = form.getValues();
    form.reset({ ...currentValues, ...valuesToSet });


    toast({ title: 'Scan Complete', description: 'Form has been pre-filled.' });
  }

  const performScan = async (photoDataUri: string) => {
    setIsScanning(true);
    try {
      const result = await scanLoomDisplay({ photoDataUri });
      processScanResult(result);
    } catch (error) {
      console.error('Scan failed:', error);
      toast({ variant: 'destructive', title: 'Scan Failed', description: 'Could not extract data from the image.' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const photoDataUri = e.target?.result as string;
      if (!photoDataUri) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not read file.' });
        return;
      }
      await performScan(photoDataUri);
    };
    reader.readAsDataURL(file);
    // Reset file input
    if(event.target) event.target.value = '';
  };

  const handleCapture = async () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if(!context) return;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const photoDataUri = canvas.toDataURL('image/jpeg');
        setShowCamera(false);
        await performScan(photoDataUri);
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const dateString = format(values.date, 'yyyy-MM-dd');
    
    // Check for duplicate record
    const isDuplicate = records.some(
      r => r.date === dateString && r.shift === values.shift && r.machineNo === values.machineNo
    );

    if (isDuplicate) {
      toast({
        variant: 'destructive',
        title: 'Duplicate Record',
        description: `A record for Machine ${values.machineNo} on ${format(values.date, 'dd/MM/yy')} (${values.shift} shift) already exists.`,
      });
      return;
    }

    const record: Omit<LoomRecord, 'id'> = {
      ...values,
      date: dateString,
    };
    addRecord(record);
    toast({ title: 'Record Saved!', description: `Record for Machine ${values.machineNo} has been added.` });
    
    const keptValues = { date: values.date, machineNo: '', shift: values.shift };
    form.reset({
        ...form.formState.defaultValues,
        ...keptValues,
        time: format(new Date(), 'HH:mm'),
        stops: 0,
        weftMeter: 0,
        total: '00:00:00',
        run: '00:00:00',
    });
    // Set focus back to machine number for quick entry
    form.setFocus('machineNo');
  };

  const machineOptions = Array.from({ length: settings.totalMachines || 0 }, (_, i) => (i + 1).toString());
  
  const formLabelStyle = "font-bold text-[9px]";

  if (showCamera) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4">
        <div className='relative w-full h-full flex items-center justify-center'>
            <video ref={videoRef} className="w-full h-full object-contain" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            {isScanning && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
                    <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
            )}
        </div>

        {hasCameraPermission === false && (
            <div className="absolute top-4 left-4 right-4">
                <Alert variant="destructive">
                  <AlertTitle>Camera Access Required</AlertTitle>
                  <AlertDescription>
                    Please allow camera access to use this feature.
                  </AlertDescription>
                </Alert>
            </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 flex gap-4">
          <Button onClick={handleCapture} className="w-full" disabled={isScanning || !hasCameraPermission}>
            <Camera className="mr-2 h-4 w-4" /> Capture
          </Button>
          <Button onClick={() => setShowCamera(false)} variant="outline" className="w-full bg-black/20 text-white border-white hover:bg-black/50">
            Cancel
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-4 p-1">
      <Card className="m-0 shadow-lg border-0">
        <CardHeader className="flex flex-row items-center justify-between p-2">
          <div className='flex items-center gap-2'>
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft />
            </Button>
            <CardTitle className='text-primary text-xl'>Add Record</CardTitle>
          </div>
          <div className="flex gap-2">
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isScanning}>
              {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload
            </Button>
            <Button type="button" onClick={() => setShowCamera(true)} disabled={isScanning}>
              <Camera className="mr-2 h-4 w-4" />
              Scan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className={formLabelStyle}>Date</FormLabel>
                      <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn('pl-3 text-left font-normal h-9 w-full', !field.value && 'text-muted-foreground')}>
                              {field.value ? format(field.value, 'dd/MM/yy') : <span>Pick date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar 
                            mode="single" 
                            selected={field.value} 
                            onSelect={(date) => {
                                if (date) {
                                    field.onChange(date);
                                    setIsDatePickerOpen(false);
                                }
                            }}
                          />
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
                      <FormLabel className={formLabelStyle}>Time</FormLabel>
                      <FormControl><Input type="time" {...field} className="h-9" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shift"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelStyle}>Shift</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Shift" /></SelectTrigger></FormControl>
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
                      <FormLabel className={formLabelStyle}>M/C No</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="h-9"><SelectValue placeholder="M/C" /></SelectTrigger></FormControl>
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
                      <FormLabel className={formLabelStyle}>Stops</FormLabel>
                      <FormControl><Input type="number" {...field} className="h-9" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weftMeter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelStyle}>Weft(m)</FormLabel>
                      <FormControl><Input type="number" step="0.1" {...field} className="h-9" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelStyle}>Total</FormLabel>
                      <FormControl><Input placeholder="HH:MM:SS" {...field} className="h-9" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="run"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={formLabelStyle}>Run</FormLabel>
                      <FormControl><Input placeholder="HH:MM:SS" {...field} className="h-9" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-6">
                <Save className="mr-2 h-4 w-4" /> Save Record
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

       {recentRecords.length > 0 && (
        <Card className="mt-4 shadow-lg border-0">
          <CardHeader className="p-2">
            <CardTitle className="text-primary text-lg">Recent Entries for {format(watchedDate, 'dd/MM/yy')} - {watchedShift} Shift</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>M/C</TableHead>
                    <TableHead>Stops</TableHead>
                    <TableHead>Weft(m)</TableHead>
                    <TableHead>Eff(%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRecords.map(record => (
                    <TableRow key={record.id} className="font-bold">
                      <TableCell>{record.time}</TableCell>
                      <TableCell>{record.machineNo}</TableCell>
                      <TableCell>{record.stops}</TableCell>
                      <TableCell>{record.weftMeter.toFixed(1)}</TableCell>
                      <TableCell>{record.efficiency.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

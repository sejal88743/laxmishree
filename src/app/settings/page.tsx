'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState } from '@/hooks/use-app-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import type { AppSettings } from '@/lib/types';
import { Save, Trash2, AlertTriangle } from 'lucide-react';

const settingsSchema = z.object({
  totalMachines: z.coerce.number().int().min(1),
  lowEfficiencyThreshold: z.coerce.number().min(0).max(100),
  geminiApiKey: z.string().optional(),
  whatsAppNumber: z.string().optional(),
  messageTemplate: z.string().optional(),
  supabaseUrl: z.string().url({ message: "Please enter a valid Supabase URL." }).optional().or(z.literal('')),
  supabaseKey: z.string().optional(),
});

export default function SettingsPage() {
  const { settings, updateSettings, deleteAllData, isInitialized } = useAppState();
  const [password, setPassword] = useState('');

  const form = useForm<AppSettings>({
    resolver: zodResolver(settingsSchema),
    values: settings,
  });

  React.useEffect(() => {
    if (isInitialized) {
      form.reset(settings);
    }
  }, [isInitialized, settings, form]);

  const onSubmit = (data: AppSettings) => {
    updateSettings(data);
    toast({ title: 'Settings Saved', description: 'Your new settings have been applied.' });
  };
  
  const handleDeleteAllData = () => {
    if (password === 'DELETE') {
        deleteAllData();
        toast({ title: 'All local data has been deleted.', description: "Supabase data may need to be deleted manually.", variant: 'destructive' });
        setPassword('');
    } else {
        toast({ title: 'Incorrect password.', description: 'Please type "DELETE" to confirm.', variant: 'destructive' });
    }
  };

  const supabaseLoomRecordsScript = `
-- Create loom_records table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.loom_records (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  time TIME NOT NULL,
  shift TEXT NOT NULL,
  machine_no TEXT NOT NULL,
  stops INT NOT NULL,
  weft_meter FLOAT NOT NULL,
  total TEXT NOT NULL,
  run TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.loom_records ENABLE ROW LEVEL SECURITY;

-- Allow public access to all records
DROP POLICY IF EXISTS "public_access_policy" ON public.loom_records;
CREATE POLICY "public_access_policy" ON public.loom_records FOR ALL USING (true) WITH CHECK (true);

-- Add table to publication for realtime
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loom_records;
  `.trim();

  const supabaseSettingsScript = `
-- Create settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY DEFAULT 'global_settings',
  total_machines INT NOT NULL DEFAULT 10,
  low_efficiency_threshold INT NOT NULL DEFAULT 90,
  whatsapp_number TEXT DEFAULT '',
  message_template TEXT DEFAULT 'Record Details:\nDate: {{date}}\nTime: {{time}}\nShift: {{shift}}\nMachine: {{machineNo}}\nEfficiency: {{efficiency}}%'
);

-- Enable Row Level Security
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow public access to settings
DROP POLICY IF EXISTS "public_access_policy" ON public.settings;
CREATE POLICY "public_access_policy" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Ensure there is only one row of settings
-- This function will insert default settings if the table is empty.
CREATE OR REPLACE FUNCTION public.ensure_single_settings_row()
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.settings WHERE id = 'global_settings') THEN
    INSERT INTO public.settings (id) VALUES ('global_settings');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Call the function to initialize settings if needed.
SELECT public.ensure_single_settings_row();

-- Add table to publication for realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
  `.trim();


  return (
    <div className="p-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-primary">General Settings</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="totalMachines" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Machines</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lowEfficiencyThreshold" render={({ field }) => (
                <FormItem>
                  <FormLabel>Low Efficiency Threshold (%)</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader><CardTitle className="text-primary">WhatsApp Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="whatsAppNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp Number (with country code)</FormLabel>
                  <FormControl><Input placeholder="+911234567890" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="messageTemplate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Template</FormLabel>
                  <FormControl><Textarea placeholder="Use {{variable}} for dynamic content" {...field} value={field.value ?? ''}/></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-primary">Backend & Sync Settings</CardTitle>
              <CardDescription>Enter your Supabase credentials to enable cloud sync. The Gemini key is used for AI features and should be set as a server secret in your hosting environment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <FormField control={form.control} name="supabaseUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase URL</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="supabaseKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase API Key (public anon)</FormLabel>
                  <FormControl><Input type="password" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
               <FormField control={form.control} name="geminiApiKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gemini API Key (Server Secret)</FormLabel>
                  <FormControl><Input type="password" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div>
                <h4 className='font-medium text-sm mb-2'>Supabase Setup Scripts</h4>
                <p className='text-sm text-muted-foreground mb-4'>Run these scripts in your Supabase SQL editor to set up the necessary tables and policies for data storage and real-time sync.</p>
                <FormLabel>1. Records Table & Policies</FormLabel>
                <Textarea readOnly value={supabaseLoomRecordsScript} className="font-mono text-xs mt-2" rows={20} />
              </div>
               <div>
                <FormLabel>2. Settings Table</FormLabel>
                <Textarea readOnly value={supabaseSettingsScript} className="font-mono text-xs mt-2" rows={25} />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
            <Save className="mr-2 h-4 w-4" /> Save All Settings
          </Button>
        </form>
      </Form>
      
      <Card className="mt-4 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle />Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">
                This action is irreversible. It will delete all records from this browser's local storage and attempt to delete them from Supabase if connected.
            </p>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete All Data</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all data. To confirm, type "DELETE" in the box below.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder='Type "DELETE" to confirm'
                        className="border-destructive focus-visible:ring-destructive"
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteAllData} disabled={password !== 'DELETE'} className="bg-destructive hover:bg-destructive/90">Confirm Deletion</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </CardContent>
      </Card>
    </div>
  );
}

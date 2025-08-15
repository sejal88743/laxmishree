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
  supabaseUrl: z.string().url().optional().or(z.literal('')),
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
        toast({ title: 'All data has been deleted.', variant: 'destructive' });
        setPassword('');
    } else {
        toast({ title: 'Incorrect password.', description: 'Please type "DELETE" to confirm.', variant: 'destructive' });
    }
  };

  const supabaseLoomRecordsScript = `
CREATE TABLE loom_records (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  time TIME NOT NULL,
  shift TEXT NOT NULL,
  machine_no TEXT NOT NULL,
  stops INTEGER NOT NULL,
  weft_meter REAL NOT NULL,
  total_time INTERVAL NOT NULL,
  run_time INTERVAL NOT NULL,
  user_id UUID DEFAULT auth.uid()
);
  `.trim();

  const supabaseSettingsScript = `
CREATE TABLE settings (
  id INT PRIMARY KEY DEFAULT 1,
  user_id UUID DEFAULT auth.uid(),
  total_machines INT NOT NULL,
  low_efficiency_threshold INT NOT NULL,
  whatsapp_number TEXT,
  message_template TEXT,
  CONSTRAINT single_row CHECK (id = 1)
);
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
            <CardHeader><CardTitle className="text-primary">API Settings</CardTitle><CardDescription>This API key will be stored as an environment variable for security.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="geminiApiKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gemini API Key</FormLabel>
                  <FormControl><Input type="password" {...field} /></FormControl>
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
                  <FormControl><Input placeholder="+911234567890" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="messageTemplate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Template</FormLabel>
                  <FormControl><Textarea placeholder="Use {{variable}} for dynamic content" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-primary">Supabase Integration</CardTitle>
              <CardDescription>Sync data to a Supabase backend. Run the SQL scripts below in your Supabase SQL editor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="supabaseUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase URL</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="supabaseKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase API Key (public anon)</FormLabel>
                  <FormControl><Input type="password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
               <div>
                <FormLabel>Loom Records Table Script</FormLabel>
                <Textarea readOnly value={supabaseLoomRecordsScript} className="font-mono text-xs mt-2" rows={11} />
              </div>
               <div>
                <FormLabel>Settings Table Script</FormLabel>
                <Textarea readOnly value={supabaseSettingsScript} className="font-mono text-xs mt-2" rows={10} />
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
                This action is irreversible. It will delete all records and settings from this browser's local storage.
            </p>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete All Local Data</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all data from local storage. To confirm, type "DELETE" in the box below.
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

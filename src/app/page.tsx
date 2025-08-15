
"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, AlertTriangle, BarChart as BarChartIcon, LayoutDashboard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAppState } from '@/hooks/use-app-state';
import { calculateEfficiency, timeToSeconds } from '@/lib/calculations';
import type { LoomRecord } from '@/lib/types';
import WhatsAppIcon from '@/components/WhatsAppIcon';

export default function Dashboard() {
  const { records, settings } = useAppState();
  const [view, setView] = useState<'card' | 'chart'>('card');

  const today = new Date();

  const performanceData = useMemo(() => {
    const machineData: { [key: string]: { todayEfficiency: number, yesterdayEfficiency: number } } = {};
    const machineNumbers = Array.from({ length: settings.totalMachines || 0 }, (_, i) => (i + 1).toString());

    machineNumbers.forEach(machineNo => {
      const todayRecords = records.filter(r => r.machineNo === machineNo && new Date(r.date).toDateString() === today.toDateString());
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayRecords = records.filter(r => r.machineNo === machineNo && new Date(r.date).toDateString() === yesterday.toDateString());

      const todayTotalRun = todayRecords.reduce((acc, r) => acc + timeToSeconds(r.run), 0);
      const todayTotalTime = todayRecords.reduce((acc, r) => acc + timeToSeconds(r.total), 0);
      const yesterdayTotalRun = yesterdayRecords.reduce((acc, r) => acc + timeToSeconds(r.run), 0);
      const yesterdayTotalTime = yesterdayRecords.reduce((acc, r) => acc + timeToSeconds(r.total), 0);

      machineData[machineNo] = {
        todayEfficiency: calculateEfficiency(todayTotalRun, todayTotalTime),
        yesterdayEfficiency: calculateEfficiency(yesterdayTotalRun, yesterdayTotalTime),
      };
    });

    return machineData;
  }, [records, today, settings.totalMachines]);

  const dailySummary = useMemo(() => {
    const summary: { date: string; totalWeft: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      const dayRecords = records.filter(r => r.date === dateString);
      const totalWeft = dayRecords.reduce((acc, r) => acc + r.weftMeter, 0);
      summary.push({ date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), totalWeft });
    }
    return summary.reverse();
  }, [records, today]);

  const lowEfficiencyAlerts = useMemo(() => {
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const recentRecords = records.filter(r => new Date(r.date) >= threeDaysAgo);
    
    const machineEfficiencies: { [key: string]: { totalRun: number, totalTime: number, efficiencies: {date: string, efficiency: number}[] } } = {};

    recentRecords.forEach(r => {
      if (!machineEfficiencies[r.machineNo]) {
        machineEfficiencies[r.machineNo] = { totalRun: 0, totalTime: 0, efficiencies: [] };
      }
      machineEfficiencies[r.machineNo].totalRun += timeToSeconds(r.run);
      machineEfficiencies[r.machineNo].totalTime += timeToSeconds(r.total);
    });
    
    const alerts: { machineNo: string; avgEfficiency: number, data: {date: string, efficiency: number}[] }[] = [];
    Object.entries(machineEfficiencies).forEach(([machineNo, data]) => {
      const avgEfficiency = calculateEfficiency(data.totalRun, data.totalTime);
      if (avgEfficiency < (settings.lowEfficiencyThreshold || 90)) {
        
        const machineRecordsByDate: {[key: string]: LoomRecord[]} = {};
        recentRecords.filter(r => r.machineNo === machineNo).forEach(r => {
          if(!machineRecordsByDate[r.date]) machineRecordsByDate[r.date] = [];
          machineRecordsByDate[r.date].push(r);
        });

        const efficiencyByDate = Object.entries(machineRecordsByDate).map(([date, dateRecords]) => {
          const totalRun = dateRecords.reduce((sum, r) => sum + timeToSeconds(r.run), 0);
          const totalTime = dateRecords.reduce((sum, r) => sum + timeToSeconds(r.total), 0);
          return { date: new Date(date).toLocaleDateString('en-GB'), efficiency: calculateEfficiency(totalRun, totalTime) };
        });

        alerts.push({ machineNo, avgEfficiency, data: efficiencyByDate });
      }
    });
    return alerts;
  }, [records, settings.lowEfficiencyThreshold, today]);
  
  const chartData = useMemo(() => {
    const data: { name: string, Day: number, Night: number }[] = [];
    const machineNumbers = Array.from({ length: settings.totalMachines || 0 }, (_, i) => `M ${i + 1}`);

    machineNumbers.forEach(machineName => {
      const machineNo = machineName.split(' ')[1];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const machineRecords = records.filter(r => r.machineNo === machineNo && new Date(r.date) >= thirtyDaysAgo);

      const dayWeft = machineRecords.filter(r => r.shift === 'Day').reduce((acc, r) => acc + r.weftMeter, 0);
      const nightWeft = machineRecords.filter(r => r.shift === 'Night').reduce((acc, r) => acc + r.weftMeter, 0);

      data.push({ name: machineName, Day: dayWeft, Night: nightWeft });
    });
    return data;
  }, [records, settings.totalMachines]);


  const handleWhatsAppShare = () => {
    if (!settings.whatsAppNumber) {
      alert("Please set a WhatsApp number in settings.");
      return;
    }
    const messageLines = lowEfficiencyAlerts.map(alert => 
      `Machine ${alert.machineNo}:\n` +
      alert.data.map(d => `  - ${d.date}: ${d.efficiency.toFixed(2)}%`).join('\n')
    );
    const message = encodeURIComponent(`Low Efficiency Alert:\n\n${messageLines.join('\n\n')}`);
    window.open(`https://wa.me/${settings.whatsAppNumber}?text=${message}`);
  };


  return (
    <div className="bg-background">
      <div className="p-2 space-y-4">
        <div className="flex gap-2">
            <Button onClick={() => setView('card')} variant={view === 'card' ? 'secondary' : 'ghost'} className="w-full">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Card View
            </Button>
            <Button onClick={() => setView('chart')} variant={view === 'chart' ? 'secondary' : 'ghost'} className="w-full">
                <BarChartIcon className="mr-2 h-4 w-4" />
                Chart View
            </Button>
        </div>

        {view === 'card' && (
            <>
                <section>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {dailySummary.map(day => (
                    <Card key={day.date} className="text-center bg-card shadow-lg border-none">
                        <CardHeader className="p-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">{day.date}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                        <p className="text-lg font-bold text-primary">{day.totalWeft.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Weft</p>
                        </CardContent>
                    </Card>
                    ))}
                </div>
                </section>

                {lowEfficiencyAlerts.length > 0 && (
                <section>
                    <Alert variant="destructive" className="bg-red-100 border-red-400 text-red-800">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="ml-2 font-bold">Low Efficiency Alert</AlertTitle>
                        </div>
                        <Button onClick={handleWhatsAppShare} size="sm" className="bg-green-500 hover:bg-green-600 text-white p-2 h-auto">
                        <WhatsAppIcon className="h-4 w-4" />
                        </Button>
                    </div>
                    <AlertDescription className="mt-2 text-sm">
                        {lowEfficiencyAlerts.map(alert => (
                        <div key={alert.machineNo} className="mb-1">
                            Machine <strong>{alert.machineNo}</strong> is at <strong>{alert.avgEfficiency.toFixed(2)}%</strong> avg. efficiency.
                        </div>
                        ))}
                    </AlertDescription>
                    </Alert>
                </section>
                )}

                <section>
                <h2 className="text-lg font-semibold text-primary mb-2">Today's Performance</h2>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {Object.entries(performanceData).map(([machineNo, data]) => {
                    const trend = data.todayEfficiency - data.yesterdayEfficiency;
                    const cardColor = data.todayEfficiency > 90 ? 'bg-green-100 border-green-300' : data.todayEfficiency > 80 ? 'bg-blue-100 border-blue-300' : 'bg-red-100 border-red-300';
                    const textColor = data.todayEfficiency > 90 ? 'text-green-800' : data.todayEfficiency > 80 ? 'text-blue-800' : 'text-red-800';

                    return (
                        <Card key={machineNo} className={`text-center shadow-md ${cardColor} ${textColor}`}>
                        <CardHeader className="p-2">
                            <CardTitle className="text-sm font-bold">M {machineNo}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                            <p className="text-xl font-bold">{data.todayEfficiency.toFixed(1)}%</p>
                            <div className={`flex items-center justify-center text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trend !== 0 && (trend > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                            {data.yesterdayEfficiency > 0 ? `${Math.abs(trend).toFixed(1)}%` : 'New'}
                            </div>
                        </CardContent>
                        </Card>
                    );
                    })}
                </div>
                </section>
            </>
        )}
      </div>

      {view === 'chart' && (
        <section className="space-y-4 p-2">
          <div>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-primary text-center">Day Shift Performance (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                    <Bar dataKey="Day" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <div>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-primary text-center">Night Shift Performance (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                    <Bar dataKey="Night" fill="hsl(var(--accent))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}

  
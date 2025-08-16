
"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUp, ArrowDown, AlertTriangle, BarChart as BarChartIcon, LayoutDashboard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAppState } from '@/hooks/use-app-state';
import { calculateEfficiency, timeToSeconds } from '@/lib/calculations';
import type { LoomRecord } from '@/lib/types';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';


export default function Dashboard() {
  const { records, settings } = useAppState();
  const [view, setView] = useState<'card' | 'chart'>('card');
  const router = useRouter();

  const today = new Date();

  const performanceData = useMemo(() => {
    const machineData: { [key: string]: { 
        todayEfficiency: number, 
        yesterdayEfficiency: number,
        todayWeft: number,
        yesterdayWeft: number
    } } = {};
    const machineNumbers = Array.from({ length: settings.totalMachines || 0 }, (_, i) => (i + 1).toString());

    machineNumbers.forEach(machineNo => {
      const todayRecords = records.filter(r => r.machineNo === machineNo && new Date(r.date).toDateString() === today.toDateString());
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayRecords = records.filter(r => r.machineNo === machineNo && new Date(r.date).toDateString() === yesterday.toDateString());

      const todayTotalRun = todayRecords.reduce((acc, r) => acc + timeToSeconds(r.run), 0);
      const todayTotalTime = todayRecords.reduce((acc, r) => acc + timeToSeconds(r.total), 0);
      const todayWeft = todayRecords.reduce((acc, r) => acc + r.weftMeter, 0);

      const yesterdayTotalRun = yesterdayRecords.reduce((acc, r) => acc + timeToSeconds(r.run), 0);
      const yesterdayTotalTime = yesterdayRecords.reduce((acc, r) => acc + timeToSeconds(r.total), 0);
      const yesterdayWeft = yesterdayRecords.reduce((acc, r) => acc + r.weftMeter, 0);

      machineData[machineNo] = {
        todayEfficiency: calculateEfficiency(todayTotalRun, todayTotalTime),
        yesterdayEfficiency: calculateEfficiency(yesterdayTotalRun, yesterdayTotalTime),
        todayWeft: todayWeft,
        yesterdayWeft: yesterdayWeft,
      };
    });

    return machineData;
  }, [records, today, settings.totalMachines]);

  const dailySummary = useMemo(() => {
    const summary: { date: string; dateObj: Date; totalWeft: number, avgEfficiency: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      const dayRecords = records.filter(r => r.date === dateString);
      
      const totalWeft = dayRecords.reduce((acc, r) => acc + r.weftMeter, 0);
      const totalRun = dayRecords.reduce((acc, r) => acc + timeToSeconds(r.run), 0);
      const totalTime = dayRecords.reduce((acc, r) => acc + timeToSeconds(r.total), 0);
      const avgEfficiency = calculateEfficiency(totalRun, totalTime);

      summary.push({ date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), dateObj: date, totalWeft, avgEfficiency });
    }
    return summary.reverse();
  }, [records, today]);

  const lowEfficiencyAlerts = useMemo(() => {
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 2); // 3 days including today
    threeDaysAgo.setHours(0,0,0,0);

    const recentRecords = records.filter(r => new Date(r.date) >= threeDaysAgo);
    
    const machineEfficiencies: { [key: string]: { totalRun: number, totalTime: number, recordCount: number, totalStops: number } } = {};

    recentRecords.forEach(r => {
      if (!machineEfficiencies[r.machineNo]) {
        machineEfficiencies[r.machineNo] = { totalRun: 0, totalTime: 0, recordCount: 0, totalStops: 0 };
      }
      machineEfficiencies[r.machineNo].totalRun += timeToSeconds(r.run);
      machineEfficiencies[r.machineNo].totalTime += timeToSeconds(r.total);
      machineEfficiencies[r.machineNo].totalStops += r.stops;
      machineEfficiencies[r.machineNo].recordCount++;
    });
    
    const alerts: { machineNo: string; avgEfficiency: number, totalStops: number, data: {date: string, efficiency: number, stops: number}[] } = [];
    Object.entries(machineEfficiencies).forEach(([machineNo, data]) => {
      if (data.recordCount === 0) return;

      const avgEfficiency = calculateEfficiency(data.totalRun, data.totalTime);
      if (avgEfficiency < settings.lowEfficiencyThreshold) {
        
        const machineRecordsByDate: {[key: string]: LoomRecord[]} = {};
        recentRecords.filter(r => r.machineNo === machineNo).forEach(r => {
          if(!machineRecordsByDate[r.date]) machineRecordsByDate[r.date] = [];
          machineRecordsByDate[r.date].push(r);
        });

        const efficiencyByDate = Object.entries(machineRecordsByDate).map(([date, dateRecords]) => {
          const totalRun = dateRecords.reduce((sum, r) => sum + timeToSeconds(r.run), 0);
          const totalTime = dateRecords.reduce((sum, r) => sum + timeToSeconds(r.total), 0);
          const totalStops = dateRecords.reduce((sum, r) => sum + r.stops, 0);
          return { 
            date: format(new Date(date), 'dd/MM/yy'),
            efficiency: calculateEfficiency(totalRun, totalTime),
            stops: totalStops
          };
        }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        alerts.push({ machineNo, avgEfficiency, totalStops: data.totalStops, data: efficiencyByDate });
      }
    });
    return alerts;
  }, [records, settings.lowEfficiencyThreshold, today]);
  
  const chartData = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const last30DaysRecords = records.filter(r => new Date(r.date) >= thirtyDaysAgo);

    const dayWeft = last30DaysRecords.filter(r => r.shift === 'Day').reduce((acc, r) => acc + r.weftMeter, 0);
    const nightWeft = last30DaysRecords.filter(r => r.shift === 'Night').reduce((acc, r) => acc + r.weftMeter, 0);

    return [{ name: 'Total Weft (Last 30 Days)', Day: dayWeft, Night: nightWeft }];
  }, [records]);


  const handleWhatsAppShare = () => {
    if (!settings.whatsAppNumber) {
      alert("Please set a WhatsApp number in settings.");
      return;
    }
    const messageLines = lowEfficiencyAlerts.map(alert => {
      const machineLines = alert.data.map(d =>
        `-- ${d.date} : *EFFI-${d.efficiency.toFixed(0)}%*, STOPS-${d.stops}`
      ).join('\n');
      return `Machine ${alert.machineNo}:\n${machineLines}`;
    });
    
    const message = encodeURIComponent(`Low Efficiency Alert:\n\n${messageLines.join('\n\n')}`);
    window.open(`https://wa.me/${settings.whatsAppNumber}?text=${message}`);
  };
  
  const handleDailySummaryClick = (date: Date) => {
    router.push(`/efficiency?date=${format(date, 'yyyy-MM-dd')}`);
  }


  return (
    <div className="bg-background m-0 p-0">
      <div className="space-y-4">
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
                    <Card key={day.date} className="text-center bg-card shadow-lg border-none cursor-pointer" onClick={() => handleDailySummaryClick(day.dateObj)}>
                        <CardHeader className="p-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">{day.date}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                        <p className="text-lg font-bold text-primary">{day.totalWeft.toLocaleString()}</p>
                        <p className="text-[11px] font-bold text-muted-foreground">{day.avgEfficiency.toFixed(2)}%</p>
                        </CardContent>
                    </Card>
                    ))}
                </div>
                </section>

                {lowEfficiencyAlerts.length > 0 && (
                <section>
                    <Alert variant="destructive" className="bg-red-100 border-red-400 text-red-800">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="ml-2 font-bold">Low Efficiency Alert (Last 3 Days)</AlertTitle>
                        </div>
                        <Button onClick={handleWhatsAppShare} size="sm" className="bg-green-500 hover:bg-green-600 text-white p-2 h-auto">
                        <WhatsAppIcon className="h-4 w-4" />
                        </Button>
                    </div>
                    <AlertDescription className="mt-2 text-sm">
                        <div className='w-full max-w-[30%]'>
                            <Table className="text-xs">
                            <TableHeader>
                                <TableRow className='text-red-900'>
                                <TableHead className='h-8'>M/C</TableHead>
                                <TableHead className='h-8'>Avg Eff</TableHead>
                                <TableHead className='h-8'>Stops</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lowEfficiencyAlerts.map(alert => (
                                <TableRow key={alert.machineNo} className="font-bold border-red-300">
                                    <TableCell className='p-1'>{alert.machineNo}</TableCell>
                                    <TableCell className='p-1'>{alert.avgEfficiency.toFixed(2)}%</TableCell>
                                    <TableCell className='p-1'>{alert.totalStops}</TableCell>
                                </TableRow>
                                ))}
                            </TableBody>
                            </Table>
                        </div>
                    </AlertDescription>
                    </Alert>
                </section>
                )}

                <section>
                <h2 className="text-lg font-semibold text-primary mb-2">Today's Performance</h2>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-2">
                    {Object.entries(performanceData).map(([machineNo, data]) => {
                    const trend = data.todayEfficiency - data.yesterdayEfficiency;
                    const cardColor = data.todayEfficiency >= 95 ? 'bg-green-100/20 border-green-300' : data.todayEfficiency >= 90 ? 'bg-yellow-100/20 border-yellow-300' : 'bg-red-100/20 border-red-300';
                    const textColor = data.todayEfficiency >= 95 ? 'text-green-800' : data.todayEfficiency >= 90 ? 'text-yellow-800' : 'text-red-800';

                    return (
                        <Card key={machineNo} className={`shadow-md ${cardColor} ${textColor}`}>
                            <CardHeader className="p-2 text-center">
                                <CardTitle className="text-sm font-bold">M {machineNo}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 text-[11px] font-bold">
                                <div className="flex justify-between"><span>Today:</span><span>{data.todayEfficiency.toFixed(1)}% ({data.todayWeft.toFixed(0)}m)</span></div>
                                <div className="flex justify-between"><span>Prev:</span><span>{data.yesterdayEfficiency.toFixed(1)}% ({data.yesterdayWeft.toFixed(0)}m)</span></div>
                                <div className={`flex items-center justify-center text-xs mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {trend > 0 && <ArrowUp className="h-3 w-3" />}
                                {trend < 0 && <ArrowDown className="h-3 w-3" />}
                                {data.yesterdayEfficiency > 0 && trend !== 0 ? `${Math.abs(trend).toFixed(1)}%` : null}
                                {data.yesterdayEfficiency === 0 && data.todayEfficiency > 0 && <ArrowUp className="h-3 w-3" />}
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
        <section className="space-y-4">
          <div>
            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-primary text-center">Shift Performance (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12}/>
                    <Tooltip />
                    <Legend wrapperStyle={{fontSize: "14px"}}/>
                    <Bar dataKey="Day" fill="hsl(var(--primary))" name="Day Shift Weft" />
                    <Bar dataKey="Night" fill="hsl(var(--accent))" name="Night Shift Weft" />
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

    


import React, { Suspense } from 'react';
import EfficiencyPageClient from './EfficiencyPageClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function EfficiencyPageSkeleton() {
    return (
        <div className="space-y-2 p-0 m-0">
            <div className="flex justify-between items-center gap-2 px-1">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-32 shrink-0" />
            </div>
            <Card className="shadow-none border-0">
                <CardHeader className="p-2">
                    <CardTitle className="text-primary text-xs font-bold">Day Shift</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Skeleton className="h-40 w-full" />
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-none border-0">
                <CardHeader className="p-2">
                    <CardTitle className="text-primary text-xs font-bold">Night Shift</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                         <Skeleton className="h-40 w-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}


export default function EfficiencyPage() {
  return (
    <Suspense fallback={<EfficiencyPageSkeleton />}>
        <EfficiencyPageClient />
    </Suspense>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LayoutDashboard, ListPlus, FileText, SettingsIcon, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useAppState } from '@/hooks/use-app-state';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/efficiency', icon: ListPlus, label: 'Efficiency' },
  { href: '/report', icon: FileText, label: 'Report' },
  { href: '/settings', icon: SettingsIcon, label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();
  const { supabaseStatus, pendingSyncCount } = useAppState();

  const getStatusIcon = () => {
    switch (supabaseStatus) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-400" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-red-400" />;
      case 'reconnecting':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusTooltip = () => {
     switch (supabaseStatus) {
      case 'connected':
        return 'Supabase Connected';
      case 'disconnected':
        return 'Supabase Disconnected';
      case 'reconnecting':
        return 'Connecting to Supabase...';
      default:
        return 'Supabase status unknown';
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-primary shadow-lg no-print">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-2">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Image src="/logo.png" alt="Laxmi Shree Logo" width={140} height={40} className="object-contain" />
        </Link>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 p-2 rounded-md bg-primary-foreground/10">
                        {getStatusIcon()}
                        {pendingSyncCount > 0 && (
                            <Badge variant="destructive" className="h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                                {pendingSyncCount}
                            </Badge>
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{getStatusTooltip()}</p>
                    {pendingSyncCount > 0 && <p>{pendingSyncCount} records pending sync.</p>}
                </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <nav className="flex items-center space-x-1">
            {navItems.map(item => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Button
                  key={item.href}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-10 w-10 text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground',
                    isActive && 'bg-primary-foreground/20 text-primary-foreground'
                  )}
                  asChild
                >
                  <Link href={item.href}>
                    <item.icon className="h-5 w-5" />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

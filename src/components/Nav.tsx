'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, ListPlus, FileText, SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/efficiency', icon: ListPlus, label: 'Efficiency' },
  { href: '/report', icon: FileText, label: 'Report' },
  { href: '/settings', icon: SettingsIcon, label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-primary shadow-lg no-print">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-2">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <span className="font-bold text-primary-foreground">Laxmi Shree</span>
        </Link>
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
    </header>
  );
}

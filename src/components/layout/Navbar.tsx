'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import LanguageSwitcher from './LanguageSwitcher';
import { useLayout } from './LayoutContext';
import { SITE } from '@/lib/site';

export default function Navbar() {
  const t = useTranslations('common.nav');
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const { config } = useLayout();
  const { navbarTransparent } = config;

  const links = [
    { href: '/', label: t('home') },
    { href: '/gallery', label: t('gallery') },
    { href: '/explore', label: t('explore') },
    { href: '/about', label: t('about') },
  ];

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full',
        navbarTransparent
          ? 'border-b border-white/10 bg-transparent'
          : 'border-b border-border bg-white/80 backdrop-blur-sm'
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/"
          className={cn(
            'text-2xl font-bold tracking-tight',
            navbarTransparent ? 'text-white' : 'text-foreground'
          )}
        >
          {SITE.name}
        </Link>

        <div className="hidden md:flex md:items-center md:gap-6">
          <NavigationMenu>
            <NavigationMenuList>
              {links.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink asChild
                    className={cn(
                      navigationMenuTriggerStyle(),
                      navbarTransparent && 'bg-transparent text-white hover:bg-white/10 hover:text-white',
                      pathname === link.href && !navbarTransparent && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <Link href={link.href}>
                      {link.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <div className={navbarTransparent ? 'text-white' : ''}>
            <LanguageSwitcher />
          </div>
        </div>

        <div className="flex items-center gap-4 md:hidden">
          <div className={navbarTransparent ? 'text-white' : ''}>
            <LanguageSwitcher />
          </div>
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={navbarTransparent ? 'text-white hover:bg-white/10' : ''}
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:max-w-xs">
              <SheetHeader>
                <SheetTitle className="text-left pl-1">{SITE.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-8 flex flex-col gap-4 pl-1">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'text-lg font-medium transition-colors hover:text-primary pl-2',
                      pathname === link.href
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

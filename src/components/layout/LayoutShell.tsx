'use client';

import Navbar from './Navbar';
import Footer from './Footer';
import { useLayout } from './LayoutContext';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const { config } = useLayout();
  const { hideNavbar, hideFooter } = config;

  return (
    <div className="flex min-h-screen flex-col">
      {!hideNavbar && <Navbar />}
      <main className="flex-1">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
}

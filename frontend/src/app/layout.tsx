import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ReachInbox Scheduler',
  description: 'Production-grade email job scheduler powered by BullMQ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-surface text-white antialiased`}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1d2e',
              color: '#fff',
              border: '1px solid #2a2d3e',
            },
          }}
        />
      </body>
    </html>
  );
}

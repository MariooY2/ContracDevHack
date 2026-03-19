import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from './providers';
import { ToastProvider } from '@/components/Toast';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileNav from '@/components/MobileNav';
import PageTransition from '@/components/PageTransition';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VOLT Protocol",
  description: "Amplify your staking yield with flash loan-powered leverage on Morpho Blue",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <ToastProvider>
          <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: 'var(--bg-primary)' }}>
            <Header />

            <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 pb-20 sm:pb-6 relative z-10 flex-1 w-full">
              <PageTransition>
                {children}
              </PageTransition>
            </main>

            <Footer />
            <MobileNav />
          </div>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}

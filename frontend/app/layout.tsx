import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import '@rainbow-me/rainbowkit/styles.css';
import { Providers } from './providers';
import Navigation from '@/components/Navigation';
import SmartAccountBanner from '@/components/SmartAccountBanner';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VOLT | Morpho Leverage Protocol",
  description: "Amplify your yield with flash loan-powered leverage on Morpho Blue across Ethereum, Base, Arbitrum & Polygon",
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
          <div className="min-h-screen bg-grid-pattern overflow-x-hidden">
            <div className="ambient-orb-1" />
            <div className="ambient-orb-2" />
            <div className="ambient-orb-3" />
            <Navigation />
            <SmartAccountBanner />
            <main className="relative z-10">
              {children}
            </main>
            <footer className="mt-12 relative z-10">
              <div className="footer-gradient-border" />
              <div className="max-w-7xl mx-auto px-6 py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span style={{ color: 'var(--text-muted)' }}>VOLT Protocol</span>
                    <span style={{ color: 'var(--border-bright)' }}>|</span>
                    <span style={{ color: 'var(--text-muted)' }}>Powered by Morpho Blue</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span style={{ color: 'var(--text-muted)' }}>
                      Flash loan leverage across 4 chains
                    </span>
                    <span style={{ color: 'var(--border-bright)' }}>|</span>
                    <span style={{ color: 'var(--accent-warning)', opacity: 0.7, fontSize: '10px' }}>
                      Use at your own risk
                    </span>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}

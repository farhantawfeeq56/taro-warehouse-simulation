import type { Metadata } from 'next'
import { Instrument_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AgentationToolbar } from '@/components/agentation'
import './globals.css'

// Agentation runs on preview deployments only — never on production.
// Vercel sets VERCEL_ENV='preview' for deployment previews and 'production'
// for the production branch; local `next dev` has no VERCEL_ENV at all.
const isPreviewOrDev =
  process.env.VERCEL_ENV === 'preview' ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'development');

export const dynamic = 'force-dynamic';

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: '--font-instrument-sans',
});

export const metadata: Metadata = {
  title: 'Taro - Warehouse Picking Simulator',
  description: 'Simulate warehouse picking strategies to optimize fulfillment efficiency',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.jpg',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.jpg',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.jpg',
      },
    ],
    apple: '/apple-icon.jpg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${instrumentSans.variable} font-sans antialiased`}>
        {children}
        <AgentationToolbar enabled={isPreviewOrDev} />
        <Analytics />
      </body>
    </html>
  )
}

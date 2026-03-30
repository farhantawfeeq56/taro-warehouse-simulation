import type { Metadata } from 'next'
import { DM_Sans, Lexend, Inter, Manrope, Figtree, Karla, Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  variable: '--font-dm-sans',
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: '--font-lexend',
});

const inter = Inter({
  subsets: ["latin"],
  variable: '--font-inter',
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: '--font-manrope',
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: '--font-figtree',
});

const karla = Karla({
  subsets: ["latin"],
  variable: '--font-karla',
});

const geist = Geist({
  subsets: ["latin"],
  variable: '--font-geist',
});

export const metadata: Metadata = {
  title: 'Taro - Warehouse Picking Simulator',
  description: 'Simulate and compare warehouse picking strategies to optimize fulfillment efficiency',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${lexend.variable} ${inter.variable} ${manrope.variable} ${figtree.variable} ${karla.variable} ${geist.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}

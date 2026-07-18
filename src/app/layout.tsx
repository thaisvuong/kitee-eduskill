import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
 title: 'KientreAAA',
 description: 'KientreAAA workflow app',
 icons: {
  icon: '/icon.svg',
  shortcut: '/icon.svg',
  apple: '/icon.svg',
 },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return (
  <html lang="vi">
   <body>{children}</body>
  </html>
 )
}

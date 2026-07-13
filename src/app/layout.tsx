import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kitee eduSkill Admin',
  description: 'Kitee web app for eduSkill and Hermes workflows',
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

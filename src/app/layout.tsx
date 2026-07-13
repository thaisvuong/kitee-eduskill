import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kitee eduSkill Admin',
  description: 'Kitee web app for eduSkill and Hermes workflows',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}

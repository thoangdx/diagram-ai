import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DBDiagram AI',
  description: 'Database schema design with AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

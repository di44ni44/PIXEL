import type {Metadata} from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css'; // Global styles

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '600', '700', '800'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'Pixelate PRO — Editor IA Gratuito',
  description: 'Editor de imágenes con IA',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="min-h-screen flex flex-col overflow-x-hidden" suppressHydrationWarning>{children}</body>
    </html>
  );
}

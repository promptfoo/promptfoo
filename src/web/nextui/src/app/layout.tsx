import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { PageShell } from './components/PageShell';
import './globals.css';

const mainFont = Inter({
  weight: ['400', '500', '700'],
  style: ['normal'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'promptfoo',
  description: 'LLM testing and evaluation',
  openGraph: {
    images: [
      {
        url: 'https://www.promptfoo.dev/img/thumbnail.png',
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={mainFont.className}>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}

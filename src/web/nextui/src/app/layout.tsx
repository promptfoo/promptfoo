import './globals.css';
import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import { PageShell } from './components/PageShell';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  style: ['normal'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'promptfoo',
  description: 'LLM testing and evaluation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={roboto.className}>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}

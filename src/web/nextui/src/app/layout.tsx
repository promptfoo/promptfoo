import { PageShell } from './components/PageShell';
import './globals.css';
import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
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
      <body className={roboto.className}>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}

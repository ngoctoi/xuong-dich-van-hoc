import type { Metadata } from 'next';
import {
  Be_Vietnam_Pro,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
  Literata,
  Noto_Serif,
  Roboto,
  Inter,
  Lora,
  Merriweather,
  Source_Serif_4,
} from 'next/font/google';
import './globals.css';

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-jakarta',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-mono',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-literata',
  display: 'swap',
});

const notoSerif = Noto_Serif({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-serif',
  display: 'swap',
});

const roboto = Roboto({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-lora',
  display: 'swap',
});

const merriweather = Merriweather({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '700'],
  variable: '--font-merriweather',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mặc Hương Các — Studio Dịch Truyện Chữ Trung - Việt AI',
  description:
    'Studio biên dịch, biên tập và đọc truyện chữ Trung - Việt chuyên sâu bằng AI với quản lý System Instructions, Glossary tên riêng, xoay vòng 50 khóa chạy 10 luồng song song và xuất chuẩn W3C EPUB 3.3.',
  openGraph: {
    title: 'Mặc Hương Các — Studio Dịch Truyện Chữ Trung - Việt AI',
    description:
      'Studio biên dịch, biên tập và đọc truyện chữ Trung - Việt chuyên sâu bằng AI với quản lý System Instructions, Glossary tên riêng, xoay vòng 50 khóa chạy 10 luồng song song và xuất chuẩn W3C EPUB 3.3.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mặc Hương Các — Studio Dịch Truyện Chữ Trung - Việt AI',
    description:
      'Studio biên dịch, biên tập và đọc truyện chữ Trung - Việt chuyên sâu bằng AI với quản lý System Instructions, Glossary tên riêng, xoay vòng 50 khóa chạy 10 luồng song song và xuất chuẩn W3C EPUB 3.3.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={[
        beVietnamPro.variable,
        plusJakarta.variable,
        jetbrainsMono.variable,
        literata.variable,
        notoSerif.variable,
        roboto.variable,
        inter.variable,
        lora.variable,
        merriweather.variable,
        sourceSerif.variable,
      ].join(' ')}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#FAF8F5] text-[#1C1917] antialiased selection:bg-[#C83E31]/20 selection:text-[#C83E31]"
        style={{
          fontFamily:
            'var(--font-be-vietnam), var(--font-inter), var(--font-roboto), system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}

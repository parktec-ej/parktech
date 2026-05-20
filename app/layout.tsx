import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ParkTec",
  description: "QR駐車場予約・時間貸しサービス",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>

          <footer className="mt-16 border-t bg-white">
            <div className="mx-auto max-w-6xl px-4 py-8">
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <Link href="/terms" className="hover:underline">
                  利用規約
                </Link>

                <Link href="/privacy" className="hover:underline">
                  プライバシーポリシー
                </Link>

                <Link href="/commerce" className="hover:underline">
                  特定商取引法に基づく表記
                </Link>

                <Link href="/cancel-policy" className="hover:underline">
                  キャンセルポリシー
                </Link>
              </div>

              <p className="mt-4 text-xs text-gray-400">
                © ParkTec
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lens.naerdev.ch";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LENS — Website Intelligence & Audit Platform",
    template: "%s · LENS",
  },
  description:
    "LENS analyses any public website and turns its technical condition into a clear report: performance, mobile, accessibility, SEO, links and security configuration.",
  applicationName: "LENS",
  keywords: ["website audit", "performance", "accessibility", "SEO", "Core Web Vitals", "technical audit"],
  openGraph: {
    title: "LENS — See what your website is made of",
    description:
      "A technical audit of any public website: measured performance, real mobile rendering, accessibility, technical SEO, link health and security configuration.",
    url: siteUrl,
    siteName: "LENS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LENS — See what your website is made of",
    description: "Measured performance, mobile rendering, accessibility, SEO, links and security for any public site.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070809" },
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeScript = `(function(){try{var stored=localStorage.getItem('lens-theme');var theme=stored==='light'||stored==='dark'?stored:'dark';document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

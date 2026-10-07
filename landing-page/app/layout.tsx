import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { CONTACT, FAQ, SITE_URL, TESTFLIGHT } from "@/lib/content";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-jetbrains-mono",
});

const TITLE = "Poppys: a private AI companion that lives on your phone";
const DESCRIPTION =
  "Poppys is an AI companion app for iPhone. Pick one of six characters, text or send voice notes, and she replies in her own voice. Everything runs on-device, nothing you say leaves your phone. Free public beta on TestFlight.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Poppys" },
  description: DESCRIPTION,
  applicationName: "Poppys",
  keywords: [
    "AI companion",
    "on-device AI",
    "private AI",
    "AI friend app",
    "voice notes",
    "offline AI",
    "iPhone",
    "TestFlight beta",
  ],
  alternates: { canonical: "/" },
  icons: { icon: "/poppys-ai-logo-transparent-cropped.png" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Poppys",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/assets/poppys-clay-companion.jpg",
        alt: "Clay-style Poppys companion character holding a red poppy",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/assets/poppys-clay-companion.jpg"],
  },
  robots: { index: true, follow: true },
};

// Structured data: what the product is, where to get it, and the FAQ, in the
// vocabulary search engines and AI agents parse. Built from lib/content.ts, the same
// source the visible page renders, so the two cannot drift apart.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Poppys",
      url: SITE_URL,
      logo: `${SITE_URL}/poppys-ai-logo-transparent-cropped.png`,
      email: CONTACT,
    },
    {
      "@type": "MobileApplication",
      name: "Poppys",
      url: SITE_URL,
      description: DESCRIPTION,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "iOS",
      installUrl: TESTFLIGHT,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <script
          type="application/ld+json"
          // Static data from lib/content.ts; "<" is escaped so the JSON cannot end the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
        />
        {children}
      </body>
    </html>
  );
}

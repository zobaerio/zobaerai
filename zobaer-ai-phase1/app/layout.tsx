import "./globals.css";
export const metadata = { title: "ZOBAER AI", description: "Your Personal AI Operating Assistant", manifest: "/manifest.webmanifest" };
export const viewport = { themeColor: "#0b0d12", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import "./globals.css";
import Nav from "./components/Nav";

export const metadata: Metadata = {
  title: "Jinxbread",
  description: "Wholesale ordering",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Nav />
          <div className="main-content">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
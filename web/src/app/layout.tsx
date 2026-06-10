import "./globals.css";
import type { ReactNode } from "react";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap"
});

export const metadata = {
  title: "Digitaliza-Sodexo",
  description: "MVP de ponto com reconhecimento facial"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = window.localStorage.getItem("digitaliza-theme");
                  var theme = stored === "dark" || stored === "light"
                    ? stored
                    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
                  document.documentElement.dataset.theme = theme;
                  document.documentElement.style.colorScheme = theme;
                } catch (_) {}
              })();
            `
          }}
        />
      </head>
      <body className={poppins.variable}>{children}</body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { Github } from "lucide-react";

const NAV = [
  { href: "/methodology", label: "Methodology" },
  { href: "/reports", label: "Reports" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header${scrolled ? " scrolled" : ""}`}>
      <div className="container header-inner">
        <div className="row" style={{ gap: 22 }}>
          <Link href="/" className="brand" aria-label="LENS home">
            <span className="brand-mark" aria-hidden="true" />
            <span>LENS</span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                style={pathname.startsWith(item.href) ? { color: "var(--text)" } : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="nav-actions">
          <a
            className="icon-btn"
            href="https://github.com/NandoErniDev/lens"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="LENS on GitHub"
          >
            <Github size={16} />
          </a>
          <ThemeToggle />
          <Link href="/#analyze" className="btn btn-sm btn-primary">
            New analysis
          </Link>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { MarketStream } from "./market-stream";
import { TopBar } from "./top-bar";

export function SubpageShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <div className="terminal-shell"><MarketStream /><TopBar /><main className="subpage"><Link href="/" className="back-link"><ArrowLeft size={13} /> BACK TO TERMINAL</Link><div className="subpage-title"><span>{eyebrow}</span><h1>{title}</h1></div>{children}</main></div>;
}


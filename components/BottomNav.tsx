"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/",         label: "Status",    icon: "📡" },
  { href: "/chat",     label: "Chat",      icon: "💬" },
  { href: "/incidents",label: "Incidents", icon: "🚨" },
  { href: "/changes",  label: "Changes",   icon: "💾" },
  { href: "/settings", label: "Settings",  icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#161922] border-t border-[#2e3450] z-50 safe-area-inset-bottom">
      <div className="flex max-w-2xl mx-auto">
        {TABS.map(tab => {
          const active = pathname === tab.href || (tab.href !== "/" && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
                active ? "text-teal-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

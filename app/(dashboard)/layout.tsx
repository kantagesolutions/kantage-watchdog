import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col bg-[#0f1117]">
      <header className="px-4 py-3 border-b border-[#2e3450] flex items-center gap-3 sticky top-0 bg-[#0f1117] z-40">
        <span className="text-xl">🛡️</span>
        <span className="font-bold text-white text-lg">Watchdog</span>
        <span className="ml-auto text-xs text-slate-500">Kantage Infrastructure</span>
      </header>

      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}

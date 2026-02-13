"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Nav({ user }: { user: { name: string; email: string } | null }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="bg-white border-b px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/workspaces" className="font-bold text-lg">Marketing Ops</Link>
        <Link href="/workspaces" className="text-sm text-gray-600 hover:text-gray-900">Workspaces</Link>
        <Link href="/runs" className="text-sm text-gray-600 hover:text-gray-900">Runs</Link>
      </div>
      {user && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{user.name}</span>
          <button onClick={logout} className="text-gray-500 hover:text-gray-900">Logout</button>
        </div>
      )}
    </nav>
  );
}

"use client";

import Link from "next/link";
import UserMenu from "./UserMenu";
import type { Role } from "@prisma/client";

interface NavUser {
  name: string;
  email: string;
  image?: string | null;
  role: Role;
}

export default function Nav({ user }: { user: NavUser | null }) {
  return (
    <nav className="bg-white border-b px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/workspaces" className="font-bold text-lg">
          Marketing Ops
        </Link>
        <Link
          href="/workspaces"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Workspaces
        </Link>
        <Link
          href="/runs"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Runs
        </Link>
        <Link
          href="/agents"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Agents
        </Link>
        <Link
          href="/agents/pipeline"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Pipeline
        </Link>
      </div>
      {user && <UserMenu user={user} />}
    </nav>
  );
}

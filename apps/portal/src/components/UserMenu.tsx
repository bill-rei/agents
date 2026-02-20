"use client";

import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  approver: "Approver",
  publisher: "Publisher",
};

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-purple-100 text-purple-700",
  approver: "bg-blue-100 text-blue-700",
  publisher: "bg-green-100 text-green-700",
};

interface UserMenuProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: Role;
  };
}

export default function UserMenu({ user }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      {user.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt={user.name ?? "User avatar"}
          width={28}
          height={28}
          className="rounded-full"
        />
      )}
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm text-gray-700 font-medium">
          {user.name ?? user.email}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[user.role]}`}
        >
          {ROLE_LABELS[user.role]}
        </span>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        className="text-sm text-gray-500 hover:text-gray-900 ml-1"
      >
        Sign out
      </button>
    </div>
  );
}

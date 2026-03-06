"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";
import { MockRoleToggle } from "./MockRoleProvider";
import { useMockRole } from "./MockRoleProvider";
import BrandSwitcher from "./BrandSwitcher";
import { useBrand } from "@/lib/useBrand";
import type { Role } from "@prisma/client";

interface NavUser {
  name: string;
  email: string;
  image?: string | null;
  role: Role;
}

const PRIMARY_LINKS = [
  { href: "/home", label: "Home" },
  { href: "/messages", label: "Messages" },
  { href: "/create", label: "Create" },
  { href: "/review", label: "Review" },
];

const SECONDARY_LINKS = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/workflows", label: "Workflows" },
  { href: "/runs", label: "Runs" },
  { href: "/agents", label: "Agents" },
  { href: "/brand-tools", label: "Brand" },
  { href: "/creative-tools", label: "Creative" },
  { href: "/settings/channels", label: "Channels" },
];

export default function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const { role } = useMockRole();
  const { brand } = useBrand();
  const isDev = process.env.NODE_ENV === "development";
  const isAdmin = user?.role === "admin" || role === "admin";
  const showBrandSwitcher = isAdmin || isDev;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-0 flex items-center justify-between sticky top-0 z-40 shadow-sm">
      {/* Left: Logo + primary links */}
      <div className="flex items-center">
        <Link
          href="/home"
          className="font-bold text-base text-gray-900 pr-6 py-4 border-r border-gray-100 mr-4"
        >
          {brand?.displayName ?? "Marketing Ops"}
        </Link>

        {/* Primary nav */}
        <div className="flex items-center">
          {PRIMARY_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                isActive(href)
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 mx-3" />

        {/* Secondary nav (smaller, muted) */}
        <div className="flex items-center gap-1">
          {SECONDARY_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                isActive(href)
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              {label}
            </Link>
          ))}
          {/* Brand Settings — admin only */}
          {isAdmin && (
            <Link
              href="/settings/brand"
              className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                isActive("/settings/brand")
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              Brand Settings
            </Link>
          )}
        </div>
      </div>

      {/* Right: brand switcher + role toggle + user */}
      <div className="flex items-center gap-3">
        {showBrandSwitcher && <BrandSwitcher />}
        <MockRoleToggle />
        {user && <UserMenu user={user} />}
      </div>
    </nav>
  );
}

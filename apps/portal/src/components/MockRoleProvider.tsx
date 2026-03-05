"use client";

import { createContext, useContext, useState, useRef, useEffect } from "react";
import type { MockRole } from "@/lib/types";

interface MockRoleContextValue {
  role: MockRole;
  name: string;
  setRole: (role: MockRole) => void;
}

const MockRoleContext = createContext<MockRoleContextValue>({
  role: "admin",
  name: "You",
  setRole: () => {},
});

export function MockRoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<MockRole>("admin");

  const names: Record<MockRole, string> = {
    admin: "Alex (Admin)",
    reviewer: "Jordan (Reviewer)",
    editor: "Sam (Editor)",
    contributor: "Chris (Contributor)",
  };

  return (
    <MockRoleContext.Provider value={{ role, name: names[role], setRole }}>
      {children}
    </MockRoleContext.Provider>
  );
}

export function useMockRole() {
  return useContext(MockRoleContext);
}

/** Role toggle shown in the nav — lets you switch between Sprint 1 roles. */
export function MockRoleToggle() {
  const { role, setRole } = useMockRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const roles: { value: MockRole; label: string; color: string }[] = [
    { value: "admin", label: "Admin", color: "bg-purple-100 text-purple-700" },
    { value: "reviewer", label: "Reviewer", color: "bg-blue-100 text-blue-700" },
    { value: "editor", label: "Editor", color: "bg-green-100 text-green-700" },
    { value: "contributor", label: "Contributor", color: "bg-yellow-100 text-yellow-700" },
  ];

  const current = roles.find((r) => r.value === role)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer select-none transition-opacity hover:opacity-80 ${current.color}`}
        title="Switch mock role (dev mode)"
      >
        {current.label} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-36 z-50">
          {roles.map((r) => (
            <button
              key={r.value}
              onClick={() => { setRole(r.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                r.value === role ? "font-semibold" : ""
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

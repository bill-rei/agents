"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    fetch("/api/workspaces").then((r) => r.json()).then(setWorkspaces);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    if (res.ok) {
      const ws = await res.json();
      setWorkspaces([ws, ...workspaces]);
      setName("");
      setSlug("");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Workspaces</h1>

      <form onSubmit={create} className="flex gap-3 mb-6">
        <input
          placeholder="Workspace name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
          }}
          className="border rounded px-3 py-2 text-sm flex-1"
          required
        />
        <input
          placeholder="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-40"
          required
        />
        <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded text-sm">
          Create
        </button>
      </form>

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <Link
            key={ws.id}
            href={`/workspaces/${ws.slug}/projects`}
            className="block bg-white border rounded p-4 hover:border-gray-400"
          >
            <div className="font-medium">{ws.name}</div>
            <div className="text-sm text-gray-500">{ws.slug}</div>
          </Link>
        ))}
        {workspaces.length === 0 && (
          <p className="text-gray-500 text-sm">No workspaces yet. Create one above.</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  slug: string;
  targetRegistryKey: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export default function ProjectsPage() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sites, setSites] = useState<Array<{ site_key: string; label: string }>>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [registryKey, setRegistryKey] = useState("");

  useEffect(() => {
    // Find workspace by slug
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((wsList: Workspace[]) => {
        const ws = wsList.find((w) => w.slug === workspaceSlug);
        if (ws) {
          setWorkspace(ws);
          fetch(`/api/workspaces/${ws.id}/projects`)
            .then((r) => r.json())
            .then(setProjects);
        }
      });
    fetch("/api/registry/sites").then((r) => r.json()).then(setSites);
  }, [workspaceSlug]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    const res = await fetch(`/api/workspaces/${workspace.id}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, targetRegistryKey: registryKey }),
    });
    if (res.ok) {
      const proj = await res.json();
      setProjects([proj, ...projects]);
      setName("");
      setSlug("");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">
        {workspace?.name || workspaceSlug}
      </h1>
      <p className="text-sm text-gray-500 mb-6">Projects</p>

      <form onSubmit={create} className="flex gap-3 mb-6 flex-wrap">
        <input
          placeholder="Project name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
          }}
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
          required
        />
        <input
          placeholder="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-32"
          required
        />
        <select
          value={registryKey}
          onChange={(e) => setRegistryKey(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          required
        >
          <option value="">Target registry...</option>
          {sites.map((s) => (
            <option key={s.site_key} value={s.site_key}>{s.label}</option>
          ))}
        </select>
        <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded text-sm">Create</button>
      </form>

      <div className="space-y-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/runs?projectId=${p.id}`}
            className="block bg-white border rounded p-4 hover:border-gray-400"
          >
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-gray-500">{p.slug} &middot; {p.targetRegistryKey}</div>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="text-gray-500 text-sm">No projects yet.</p>
        )}
      </div>
    </div>
  );
}

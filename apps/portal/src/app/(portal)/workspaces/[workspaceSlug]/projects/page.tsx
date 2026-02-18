"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  slug: string;
  targetRegistryKey: string;
  targetRegistryKeys: string[];
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface TargetSummary {
  site_key: string;
  label: string;
  type: "web" | "social";
  brand: string;
}

export default function ProjectsPage() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  useEffect(() => {
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
    fetch("/api/registry/sites").then((r) => r.json()).then(setTargets);
  }, [workspaceSlug]);

  // Group targets by brand
  const byBrand = useMemo(() => {
    const groups: Record<string, TargetSummary[]> = {};
    for (const t of targets) {
      const b = t.brand || "unknown";
      (groups[b] ||= []).push(t);
    }
    return groups;
  }, [targets]);

  // Determine which brand is locked based on current selection
  const lockedBrand = useMemo(() => {
    if (selectedKeys.length === 0) return null;
    const first = targets.find((t) => t.site_key === selectedKeys[0]);
    return first?.brand || null;
  }, [selectedKeys, targets]);

  function toggleTarget(siteKey: string) {
    setSelectedKeys((prev) =>
      prev.includes(siteKey)
        ? prev.filter((k) => k !== siteKey)
        : [...prev, siteKey]
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || selectedKeys.length === 0) return;
    const res = await fetch(`/api/workspaces/${workspace.id}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, targetRegistryKeys: selectedKeys }),
    });
    if (res.ok) {
      const proj = await res.json();
      setProjects([proj, ...projects]);
      setName("");
      setSlug("");
      setSelectedKeys([]);
    }
  }

  function targetLabels(p: Project): string {
    const keys = p.targetRegistryKeys?.length > 0
      ? p.targetRegistryKeys
      : [p.targetRegistryKey];
    return keys
      .map((k) => targets.find((t) => t.site_key === k)?.label || k)
      .join(", ");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">
        {workspace?.name || workspaceSlug}
      </h1>
      <p className="text-sm text-gray-500 mb-6">Projects</p>

      <form onSubmit={create} className="mb-6 bg-white border rounded p-4">
        <div className="flex gap-3 mb-4 flex-wrap">
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
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Publish Targets
            {lockedBrand && (
              <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {lockedBrand.toUpperCase()} brand locked
              </span>
            )}
          </p>

          {Object.entries(byBrand).map(([brand, brandTargets]) => {
            const disabled = lockedBrand !== null && lockedBrand !== brand;
            return (
              <div key={brand} className={`mb-3 ${disabled ? "opacity-40" : ""}`}>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  {brand === "llif" ? "LLIF" : "Best Life"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {brandTargets.map((t) => {
                    const checked = selectedKeys.includes(t.site_key);
                    return (
                      <label
                        key={t.site_key}
                        className={`flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer transition-all ${
                          checked
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        } ${disabled ? "pointer-events-none" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleTarget(t.site_key)}
                          className="accent-blue-600"
                        />
                        <span className={`inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          t.type === "web"
                            ? "bg-green-100 text-green-700"
                            : "bg-purple-100 text-purple-700"
                        }`}>
                          {t.type}
                        </span>
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {selectedKeys.length === 0 && (
            <p className="text-xs text-gray-400">Select at least one target. All targets must be the same brand.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={selectedKeys.length === 0}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-40"
        >
          Create Project
        </button>
      </form>

      <div className="space-y-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/runs?projectId=${p.id}`}
            className="block bg-white border rounded p-4 hover:border-gray-400"
          >
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-gray-500">{p.slug} &middot; {targetLabels(p)}</div>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="text-gray-500 text-sm">No projects yet.</p>
        )}
      </div>
    </div>
  );
}

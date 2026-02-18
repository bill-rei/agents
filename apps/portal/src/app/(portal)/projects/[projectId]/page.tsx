"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  slug: string;
  targetRegistryKeys: string[];
}

interface ProjectDoc {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  description: string | null;
  createdAt: string;
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Load project info
  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((runs: Array<{ project: Project }>) => {
        const proj = runs.find((r) => r.project.id === projectId)?.project;
        if (proj) setProject(proj);
      });
  }, [projectId]);

  const loadDocs = useCallback(() => {
    fetch(`/api/projects/${projectId}/docs`)
      .then((r) => r.json())
      .then(setDocs);
  }, [projectId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/docs`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Upload failed");
      }
    }

    loadDocs();
    setUploading(false);
    e.target.value = "";
  }

  async function deleteDoc(assetId: string) {
    await fetch(`/api/projects/${projectId}/docs?assetId=${assetId}`, {
      method: "DELETE",
    });
    loadDocs();
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/runs" className="text-sm text-gray-400 hover:text-gray-600">&larr; Runs</Link>
        <h1 className="text-2xl font-bold">{project?.name || "Project"}</h1>
      </div>

      {/* Reference Documents Section */}
      <div className="bg-white border rounded p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Reference Documents</h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload documents that all agents will receive during campaign runs.
              Supported formats: PDF, DOCX, TXT, MD, CSV.
            </p>
          </div>
          <label className={`bg-gray-900 text-white px-4 py-2 rounded text-sm cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : "hover:bg-gray-800"}`}>
            {uploading ? "Uploading..." : "Upload Files"}
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.xlsx"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>

        {error && (
          <p className="text-red-600 text-sm mb-3">{error}</p>
        )}

        {docs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No reference documents uploaded yet.</p>
            <p className="text-xs mt-1">Upload brand guidelines, product specs, personas, or any reference material your agents need.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between border rounded px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {doc.mimeType.includes("pdf") ? "📄" : doc.mimeType.includes("word") || doc.mimeType.includes("docx") ? "📝" : "📃"}
                  </span>
                  <div>
                    <div className="font-medium text-sm">{doc.filename}</div>
                    <div className="text-xs text-gray-400">
                      {formatSize(doc.size)} &middot; {new Date(doc.createdAt).toLocaleDateString()}
                      {doc.description && <span> &middot; {doc.description}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteDoc(doc.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-6">
        <Link
          href={`/runs?projectId=${projectId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          View runs for this project &rarr;
        </Link>
      </div>
    </div>
  );
}

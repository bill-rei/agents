"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AgentStatusDot from "@/components/AgentStatusDot";

interface AgentInfo {
  key: string;
  label: string;
  pipeline: string;
  pipelineOrder: number;
  online: boolean;
}

const CAMPAIGN_FLOW = [
  { key: "strategist", label: "Strategist" },
  { key: "marketing-compiler", label: "Compiler" },
  { key: "editor", label: "Editor" },
  { key: "distributor", label: "Distributor" },
  { key: "optimizer", label: "Optimizer" },
];

const WEB_FLOW = [
  { key: "strategist", label: "Strategist" },
  { key: "site-auditor", label: "Site Auditor" },
  { key: "website-messaging-architect", label: "Messaging Architect" },
  { key: "web-renderer", label: "Web Renderer" },
];

export default function PipelinePage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(data.agents || []));
  }, []);

  const healthMap = Object.fromEntries(agents.map((a) => [a.key, a.online]));

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Pipeline</h2>

      <div className="space-y-8">
        <PipelineRow title="Campaign Pipeline" steps={CAMPAIGN_FLOW} healthMap={healthMap} />
        <PipelineRow title="Web Page Pipeline" steps={WEB_FLOW} healthMap={healthMap} />
      </div>
    </div>
  );
}

function PipelineRow({
  title,
  steps,
  healthMap,
}: {
  title: string;
  steps: { key: string; label: string }[];
  healthMap: Record<string, boolean>;
}) {
  return (
    <div className="bg-white border rounded p-6">
      <h3 className="text-sm font-bold text-gray-600 mb-4">{title}</h3>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center">
            {i > 0 && (
              <div className="text-gray-300 mx-1 text-lg">&rarr;</div>
            )}
            <Link
              href={`/agents/${step.key}`}
              className="flex items-center gap-2 px-4 py-3 bg-gray-50 border rounded hover:border-blue-300 hover:bg-blue-50 transition-all min-w-[140px]"
            >
              <AgentStatusDot online={healthMap[step.key] ?? null} />
              <span className="text-sm font-medium whitespace-nowrap">{step.label}</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

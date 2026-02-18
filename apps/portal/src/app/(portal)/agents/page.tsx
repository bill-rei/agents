"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AgentStatusDot from "@/components/AgentStatusDot";

interface AgentInfo {
  key: string;
  label: string;
  description: string;
  pipeline: string;
  pipelineOrder: number;
  online: boolean;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading agents...</p>;
  }

  const campaignAgents = agents
    .filter((a) => a.pipeline === "campaign" || a.pipeline === "both")
    .sort((a, b) => a.pipelineOrder - b.pipelineOrder);

  const webAgents = agents
    .filter((a) => a.pipeline === "web" || a.pipeline === "both")
    .sort((a, b) => a.pipelineOrder - b.pipelineOrder);

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Agents</h2>

      <div className="mb-8">
        <h3 className="text-sm font-bold text-gray-500 mb-3">Campaign Pipeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {campaignAgents.map((agent) => (
            <AgentCard key={agent.key} agent={agent} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-500 mb-3">Web Page Pipeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {webAgents.map((agent) => (
            <AgentCard key={agent.key} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentInfo }) {
  return (
    <Link
      href={`/agents/${agent.key}`}
      className="bg-white border rounded p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 mb-1">
        <AgentStatusDot online={agent.online} />
        <span className="font-medium text-sm">{agent.label}</span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{agent.description}</p>
    </Link>
  );
}

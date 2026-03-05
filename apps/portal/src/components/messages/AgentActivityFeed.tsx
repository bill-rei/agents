"use client";

import { useEffect, useRef } from "react";
import type { AgentStep, AgentActivityEvent } from "@/lib/types";

const STEP_STATE_STYLES = {
  idle: "bg-gray-200 text-gray-400",
  running: "bg-blue-500 text-white animate-pulse",
  done: "bg-green-500 text-white",
  error: "bg-red-500 text-white",
};

const STEP_ICONS = {
  idle: "○",
  running: "⟳",
  done: "✓",
  error: "✕",
};

const LEVEL_STYLES = {
  info: "text-gray-600",
  warn: "text-yellow-600",
  error: "text-red-600",
};

const LEVEL_PREFIXES = {
  info: "·",
  warn: "⚠",
  error: "✕",
};

interface AgentActivityFeedProps {
  pipeline: AgentStep[];
  activity: AgentActivityEvent[];
  isRunning?: boolean;
}

export default function AgentActivityFeed({
  pipeline,
  activity,
  isRunning = false,
}: AgentActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activity.length]);

  const activeStep = pipeline.find((s) => s.state === "running");
  const completedCount = pipeline.filter((s) => s.state === "done").length;

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-xl overflow-hidden text-sm font-mono">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
        <span className="text-gray-300 font-sans font-semibold text-xs tracking-wide uppercase">
          Agent Activity
        </span>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-blue-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live
          </span>
        )}
        {!isRunning && activity.length > 0 && (
          <span className="text-gray-500 text-xs">
            {completedCount}/{pipeline.length} steps
          </span>
        )}
      </div>

      {/* Pipeline steps */}
      <div className="px-4 py-3 border-b border-gray-800 flex flex-wrap gap-2">
        {pipeline.map((step) => (
          <div
            key={step.id}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-sans transition-all ${STEP_STATE_STYLES[step.state]}`}
          >
            <span className="text-[10px]">{STEP_ICONS[step.state]}</span>
            <span>{step.name}</span>
          </div>
        ))}
      </div>

      {/* Activity log */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
        style={{ minHeight: 0 }}
      >
        {activity.length === 0 && (
          <p className="text-gray-600 text-xs font-sans italic">
            {isRunning
              ? "Starting agents…"
              : "No activity yet. Generate a message to see the agent pipeline in action."}
          </p>
        )}
        {activity.map((event) => (
          <div key={event.id} className="flex gap-2">
            <span className="text-gray-600 text-[10px] whitespace-nowrap mt-0.5">
              {formatTime(event.ts)}
            </span>
            <span className={`text-[10px] mt-0.5 ${LEVEL_STYLES[event.level]}`}>
              {LEVEL_PREFIXES[event.level]}
            </span>
            <span className="text-indigo-400 text-[10px] whitespace-nowrap mt-0.5">
              [{event.agentName}]
            </span>
            <span className={`text-xs break-words ${LEVEL_STYLES[event.level]}`}>
              {event.message}
            </span>
          </div>
        ))}
        {isRunning && activeStep && (
          <div className="flex gap-2 items-center">
            <span className="text-gray-600 text-[10px]">now</span>
            <span className="text-blue-400 text-xs animate-pulse">
              [{activeStep.name}] running…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

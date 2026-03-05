import type { AgentStep } from "@/lib/types";

const STEP_COLORS: Record<string, string> = {
  Strategist: "bg-indigo-100 text-indigo-700",
  Compiler:   "bg-blue-100 text-blue-700",
  Editor:     "bg-violet-100 text-violet-700",
  Creative:   "bg-pink-100 text-pink-700",
  Optimizer:  "bg-amber-100 text-amber-700",
  Distributor:"bg-emerald-100 text-emerald-700",
};

interface PipelinePreviewProps {
  steps: AgentStep[];
  size?: "sm" | "md";
}

export default function PipelinePreview({ steps, size = "sm" }: PipelinePreviewProps) {
  if (steps.length === 0) {
    return <span className="text-xs text-gray-400 italic">No steps configured</span>;
  }

  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2.5 py-1";

  return (
    <div className="flex items-center flex-wrap gap-1">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1">
          <span
            className={`${STEP_COLORS[step.name] ?? "bg-gray-100 text-gray-600"} ${padding} ${textSize} font-medium rounded-full whitespace-nowrap`}
          >
            {step.name}
          </span>
          {i < steps.length - 1 && (
            <span className="text-gray-300 text-[10px]">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

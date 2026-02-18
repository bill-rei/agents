export default function AgentStatusDot({ online }: { online: boolean | null }) {
  const color = online === true ? "bg-green-500" : online === false ? "bg-red-400" : "bg-gray-300";
  const label = online === true ? "Online" : online === false ? "Offline" : "Unknown";
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}
      title={label}
    />
  );
}

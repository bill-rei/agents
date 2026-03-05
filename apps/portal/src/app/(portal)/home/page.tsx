import Link from "next/link";
import { listMessages, listWorkflowTemplates } from "@/lib/mock";
import MessageCard from "@/components/messages/MessageCard";
import QuickPost from "@/components/messages/QuickPost";
import type { MessageStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function Section({
  title,
  count,
  children,
  emptyText,
  href,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  emptyText: string;
  href?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
          {title}
          {count > 0 && (
            <span className="ml-2 bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-normal">
              {count}
            </span>
          )}
        </h2>
        {href && (
          <Link href={href} className="text-xs text-indigo-600 hover:underline">
            View all →
          </Link>
        )}
      </div>
      {count === 0 ? (
        <p className="text-sm text-gray-400 italic py-4 text-center bg-white rounded-xl border border-dashed border-gray-200">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

export default function HomePage() {
  const all = listMessages();
  const templates = listWorkflowTemplates();
  const recent = all.slice(0, 4);
  const inReview = all.filter((m) => m.status === "in_review");
  const scheduled = all.filter((m) => m.status === "scheduled");

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Hero prompt */}
      <div className="mb-8">
        <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-2xl px-8 py-10 text-white mb-6 shadow-lg">
          <h1 className="text-2xl font-bold mb-1">
            What message do you want to share?
          </h1>
          <p className="text-indigo-200 text-sm">
            Describe your idea below and the agent pipeline will generate assets across all selected channels.
          </p>
        </div>

        <QuickPost templates={templates} />
      </div>

      {/* Dashboard panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent messages */}
        <div className="lg:col-span-2">
          <Section
            title="Recent Messages"
            count={recent.length}
            emptyText="No messages yet. Create your first one above."
            href="/messages"
          >
            {recent.map((m) => (
              <MessageCard key={m.id} msg={m} />
            ))}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Section
            title="Pending Review"
            count={inReview.length}
            emptyText="Nothing pending review."
            href="/review"
          >
            {inReview.slice(0, 3).map((m) => (
              <MessageCard key={m.id} msg={m} />
            ))}
          </Section>

          <Section
            title="Scheduled"
            count={scheduled.length}
            emptyText="Nothing scheduled."
            href="/messages"
          >
            {scheduled.slice(0, 3).map((m) => (
              <MessageCard key={m.id} msg={m} />
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

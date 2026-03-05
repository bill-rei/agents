import { notFound } from "next/navigation";
import { getUCSMessage } from "@/lib/ucs/storage";
import CampaignComposer from "./CampaignComposer";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const message = await getUCSMessage(params.id);
  if (!message) notFound();
  return <CampaignComposer initialMessage={message} />;
}

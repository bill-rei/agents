import { listWorkflowTemplates } from "@/lib/mock";
import CreateForm from "./CreateForm";

export const dynamic = "force-dynamic";

export default function CreatePage() {
  const templates = listWorkflowTemplates();
  return <CreateForm templates={templates} />;
}

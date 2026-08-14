import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/ui";
import AssistantChat from "./AssistantChat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const user = await requireUser();

  return (
    <div>
      <PageHead
        title="Assistant"
        sub="Ask about the portfolio in plain language. Answers are drawn from live system data and scoped to your role — it cannot tell you anything the rest of the app would not."
      />
      <AssistantChat firstName={user.name.split(" ")[0]} />
    </div>
  );
}

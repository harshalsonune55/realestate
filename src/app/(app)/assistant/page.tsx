import { requirePerm } from "@/lib/auth";
import { PageHead } from "@/components/ui";
import AssistantChat from "./AssistantChat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  // Manager and above only. The assistant answers across the whole portfolio
  // and, for anyone holding admin.users, across the staff as well — a wider
  // view than the pages a junior role can open, so it is gated on its own
  // permission rather than left to whoever can reach the URL.
  const user = await requirePerm("assistant.use");

  return (
    <div>
      <PageHead
        title="Assistant"
        sub="Ask about the portfolio in plain language. Answers are drawn from live system data and scoped to your role — it cannot tell you anything the rest of the app would not."
      />
      <AssistantChat firstName={user.name.split(" ")[0]} userId={user.id} />
    </div>
  );
}

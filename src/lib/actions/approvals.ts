"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { decideApproval, findApproval } from "@/lib/repos/approvals";
import { ConflictError } from "@/lib/repos/shared";
import { syncPendingTasks } from "@/lib/actions/task-sync";

type Result = { ok: true; message: string } | { ok: false; message: string };

export async function decideApprovalAction(
  approvalId: string,
  decision: "approved" | "rejected",
  note: string
): Promise<Result> {
  const user = await requirePerm("approvals.decide");

  const approval = await findApproval(approvalId);
  if (!approval) return { ok: false, message: "Approval not found." };
  if (approval.status !== "pending")
    return { ok: false, message: `This item was already ${approval.status}.` };
  if (approval.requestedBy === user.id)
    return { ok: false, message: "You cannot approve a request you raised yourself." };
  if (decision === "rejected" && note.trim().length < 10)
    return { ok: false, message: "Give a reason of at least 10 characters when rejecting." };

  try {
    await decideApproval({
      approvalId,
      decision,
      note: note.trim(),
      actorId: user.id,
      now: new Date().toISOString(),
    });
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    return { ok: false, message: "Somebody else decided this item while you were reviewing it." };
  }

  await logAudit(
    user,
    decision === "approved" ? "approval.approved" : "approval.rejected",
    "approval",
    approvalId,
    `${decision === "approved" ? "Approved" : "Rejected"} ${approval.ref} — ${approval.title}`,
    [{ field: "status", from: "pending", to: decision }]
  );

  await syncPendingTasks();
  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      decision === "approved"
        ? "Approved. The change is now live and the follow-up tasks have been created."
        : "Rejected. The requester has been given a task to rework it.",
  };
}

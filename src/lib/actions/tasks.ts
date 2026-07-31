"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db, write } from "@/lib/store";
import { logAudit } from "@/lib/audit";

type Result = { ok: true; message: string } | { ok: false; message: string };

/** Tasks that represent a guided procedure cannot simply be ticked off. */
const GUIDED_ENTITIES = new Set(["cheque", "approval"]);

export async function completeTaskAction(taskId: string, note: string): Promise<Result> {
  const user = await requireUser();
  const task = db().tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, message: "Task not found." };
  if (task.assignedTo !== user.id && user.role !== "admin" && user.role !== "manager")
    return { ok: false, message: "This task is assigned to someone else." };
  if (task.status === "done") return { ok: false, message: "Already completed." };

  if (GUIDED_ENTITIES.has(task.entityType ?? "")) {
    return {
      ok: false,
      message:
        task.entityType === "cheque"
          ? "This task closes itself once you complete the cheque procedure. Open the cheque and follow the steps."
          : "This task closes itself once the approval is decided.",
    };
  }

  if (note.trim().length < 5)
    return { ok: false, message: "Write a short note saying what you did before closing a task." };

  write((store) => {
    const t = store.tasks.find((x) => x.id === taskId)!;
    t.status = "done";
    t.completedAt = new Date().toISOString();
    t.detail = t.detail + ` — closed: ${note.trim()}`;
  });

  logAudit(user, "task.completed", "task", taskId, `Completed task: ${task.title}`, [
    { field: "status", from: task.status, to: "done" },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, message: "Task closed." };
}

export async function reassignTaskAction(taskId: string, userId: string): Promise<Result> {
  const user = await requireUser();
  if (user.role !== "manager" && user.role !== "admin")
    return { ok: false, message: "Only a manager can reassign work." };

  const d = db();
  const task = d.tasks.find((t) => t.id === taskId);
  const target = d.users.find((u) => u.id === userId);
  if (!task || !target) return { ok: false, message: "Task or employee not found." };

  const from = d.users.find((u) => u.id === task.assignedTo)?.name ?? task.assignedTo;
  write((store) => {
    const t = store.tasks.find((x) => x.id === taskId)!;
    t.assignedTo = userId;
  });

  logAudit(user, "task.reassigned", "task", taskId, `Reassigned "${task.title}"`, [
    { field: "assignedTo", from, to: target.name },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, message: `Reassigned to ${target.name}.` };
}

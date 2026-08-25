"use client";

import { useMemo } from "react";
import Wizard, { StepDef } from "@/components/Wizard";
import { Field, Input, KV, Note, RadioCards, Row, Select, Textarea } from "@/components/form";
import {
  DURATIONS,
  EARLIEST_HOUR,
  LATEST_HOUR,
  VisitDraft,
  formatVisitWhen,
  draftInstant,
  slotProblems,
  visitorProblems,
  type ExistingVisit,
} from "@/lib/actions/visit-rules";
import { createVisitAction, updateVisitAction } from "@/lib/actions/visits";

export interface UnitLite {
  id: string;
  unitNo: string;
  propertyId: string;
  type: string;
  status: string;
}

/**
 * One form, two jobs.
 *
 * Booking and rescheduling ask for exactly the same things, validate them the
 * same way and convert time the same way. A second form would be a second place
 * for the timezone conversion to drift.
 */
export default function VisitForm({
  mode,
  visitId,
  initialDraft,
  properties,
  units,
  existing,
  presetUnitId,
  presetDate,
}: {
  mode: "create" | "edit";
  visitId?: string;
  initialDraft?: VisitDraft;
  properties: { id: string; name: string }[];
  units: UnitLite[];
  existing: ExistingVisit[];
  presetUnitId?: string;
  /** `YYYY-MM-DD` the agenda was showing when "Book a viewing" was pressed. */
  presetDate?: string;
}) {
  const preset = units.find((u) => u.id === presetUnitId);
  const editing = mode === "edit";

  const initial: VisitDraft = initialDraft ?? {
    // Arriving from a unit page, the space is already known — asking again
    // would be the form ignoring what the agent just tapped.
    propertyId: preset?.propertyId ?? "",
    unitId: preset?.id ?? "",
    visitorName: "",
    visitorPhone: "",
    visitorEmail: "",
    date: presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate) ? presetDate : "",
    time: "",
    durationMins: 30,
    notes: "",
  };

  const steps: StepDef<VisitDraft>[] = useMemo(
    () => [
      {
        id: "slot",
        title: "Where and when",
        hint: "Pick the unit, then the day and time. Viewings run between 8:00 and 21:00.",
        problems: (d) => slotProblems(d, existing),
        render: ({ data, set }) => {
          const inProperty = units.filter(
            (u) => !data.propertyId || u.propertyId === data.propertyId
          );
          const chosen = units.find((u) => u.id === data.unitId);
          const property = properties.find((p) => p.id === chosen?.propertyId);
          const when = draftInstant(data.date, data.time);

          return (
            <>
              <Row>
                <Field label="Property">
                  <Select
                    value={data.propertyId}
                    onChange={(e) =>
                      // Changing building invalidates the unit underneath it.
                      set({ propertyId: e.target.value, unitId: "" })
                    }
                  >
                    <option value="">All properties</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Unit">
                  <Select
                    value={data.unitId}
                    onChange={(e) => {
                      const unit = units.find((u) => u.id === e.target.value);
                      set({ unitId: e.target.value, propertyId: unit?.propertyId ?? data.propertyId });
                    }}
                  >
                    <option value="">Choose a unit…</option>
                    {inProperty.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unitNo} · {u.type} · {u.status}
                      </option>
                    ))}
                  </Select>
                </Field>
              </Row>

              <Row>
                <Field label="Date">
                  <Input
                    type="date"
                    value={data.date}
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </Field>

                <Field
                  label="Time"
                  hint={`Between ${EARLIEST_HOUR}:00 and ${LATEST_HOUR}:00, Gulf time`}
                >
                  <Input
                    type="time"
                    step={900}
                    value={data.time}
                    onChange={(e) => set({ time: e.target.value })}
                  />
                </Field>
              </Row>

              <Field label="How long">
                <RadioCards
                  value={String(data.durationMins)}
                  onChange={(v) => set({ durationMins: Number(v) })}
                  options={DURATIONS.map((mins) => ({
                    value: String(mins),
                    title: `${mins} min`,
                    detail:
                      mins <= 15
                        ? "A quick look"
                        : mins >= 90
                          ? "Several units or a long walkthrough"
                          : "A normal viewing",
                  }))}
                />
              </Field>

              {when && chosen ? (
                <Note tone="info">
                  <KV label="Space" value={`${property?.name ?? "—"} · Unit ${chosen.unitNo}`} />
                  <KV label="When" value={formatVisitWhen(when.toISOString())} />
                  <KV label="Ends" value={`after ${data.durationMins} minutes`} />
                </Note>
              ) : null}
            </>
          );
        },
      },
      {
        id: "visitor",
        title: "Who is coming",
        hint: "A phone number is required — viewings get moved, and this is how you reach them.",
        problems: (d) => visitorProblems(d),
        render: ({ data, set }) => (
          <>
            <Row>
              <Field label="Visitor name">
                <Input
                  value={data.visitorName}
                  onChange={(e) => set({ visitorName: e.target.value })}
                  placeholder="Ahmed Khan"
                />
              </Field>

              <Field label="Contact number">
                <Input
                  value={data.visitorPhone}
                  onChange={(e) => set({ visitorPhone: e.target.value })}
                  placeholder="+971 50 123 4567"
                  inputMode="tel"
                />
              </Field>
            </Row>

            <Field label="Email" hint="Optional">
              <Input
                type="email"
                value={data.visitorEmail}
                onChange={(e) => set({ visitorEmail: e.target.value })}
                placeholder="ahmed@example.com"
              />
            </Field>

            <Field label="Notes" hint="Anything the person showing the unit should know">
              <Textarea
                rows={4}
                value={data.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Looking for a 3BR, wants a high floor, coming with family."
              />
            </Field>

            <Note tone="info">
              {editing
                ? "Saving updates the same Odoo calendar entry rather than creating a second one. If Odoo is unreachable the change is still saved and can be retried."
                : "This viewing is added to the Odoo calendar as well. If Odoo is unreachable the booking is still saved and the calendar entry is retried."}
            </Note>
          </>
        ),
      },
    ],
    [properties, units, existing, editing]
  );

  return (
    <Wizard<VisitDraft>
      title={editing ? "Update viewing" : "Book a viewing"}
      subtitle={
        editing
          ? "Change the slot, the visitor or the notes. The Odoo calendar entry moves with it."
          : "Reserve a slot to show a unit, and put it in everyone's calendar."
      }
      steps={steps}
      initial={initial}
      submitLabel={editing ? "Update viewing" : "Book viewing"}
      submitNote="Saved here first, then mirrored to the Odoo calendar."
      onSubmit={
        editing
          ? (payload) => updateVisitAction(visitId!, payload)
          : createVisitAction
      }
      exitHref={editing ? `/visits/${visitId}` : "/visits"}
    />
  );
}

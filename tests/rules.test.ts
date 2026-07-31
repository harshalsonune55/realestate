import assert from "node:assert";
import { stepProblems, type ContractDraft } from "@/lib/actions/contract-rules";
import { depositProblems, bounceProblems, type DepositDraft } from "@/lib/actions/cheque-rules";
import { maintenanceProblems, type MaintenanceDraft } from "@/lib/actions/maintenance-rules";
import { renewalProblems, type RenewalDraft } from "@/lib/actions/renewal-rules";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = iso(new Date());
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

let pass = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
    console.log("  ok   " + name);
  } catch (e) {
    console.log("  FAIL " + name + " — " + (e as Error).message);
    process.exitCode = 1;
  }
};

/* ------------------------------------------------- contract wizard rules */
const emptyContract: ContractDraft = {
  propertyId: "", unitId: "", tenantMode: "new", existingTenantId: "",
  tenantKind: "individual", tenantName: "", emiratesId: "", passportNo: "",
  nationality: "", phone: "+971", email: "", tradeLicense: "",
  startDate: today, termMonths: 12, annualRent: 0, chequeCount: 4, cheques: [],
  securityDeposit: 0, commission: 0, ejariNo: "", docs: {}, checks: {},
  notes: "", confirmName: "", confirmTargetName: "",
};

console.log("\nContract wizard");
check("step 1 blocks an empty unit choice", () => {
  assert.ok(stepProblems(emptyContract)[0].length > 0);
});
check("step 2 rejects a malformed Emirates ID", () => {
  const d = { ...emptyContract, tenantName: "Ali Hassan", emiratesId: "784-99-1-2", phone: "+971501234567", email: "a@b.com", passportNo: "P1234567", nationality: "UAE" };
  assert.ok(stepProblems(d)[1].some((p) => p.includes("784-1990")));
});
check("step 2 rejects a non-UAE mobile", () => {
  const d = { ...emptyContract, tenantName: "Ali Hassan", emiratesId: "784-1990-1234567-1", phone: "+447700900123", email: "a@b.com", passportNo: "P1234567", nationality: "UAE" };
  assert.ok(stepProblems(d)[1].some((p) => p.includes("UAE number")));
});
check("step 2 accepts a fully valid tenant", () => {
  const d = { ...emptyContract, tenantName: "Ali Hassan", emiratesId: "784-1990-1234567-1", phone: "+971501234567", email: "ali@mail.com", passportNo: "P1234567", nationality: "UAE" };
  assert.deepStrictEqual(stepProblems(d)[1], []);
});
check("step 3 rejects a start date over 30 days in the past", () => {
  const d = { ...emptyContract, startDate: plus(-60), annualRent: 60000, ejariNo: "123456789012" };
  assert.ok(stepProblems(d)[2].some((p) => p.includes("30 days in the past")));
});
check("step 4 blocks a cheque schedule that does not equal the rent", () => {
  const d: ContractDraft = {
    ...emptyContract, annualRent: 60000,
    cheques: [
      { chequeNo: "100001", bank: "ADCB", amount: 15000, dueDate: today },
      { chequeNo: "100002", bank: "ADCB", amount: 15000, dueDate: plus(90) },
      { chequeNo: "100003", bank: "ADCB", amount: 15000, dueDate: plus(180) },
      { chequeNo: "100004", bank: "ADCB", amount: 14000, dueDate: plus(270) },
    ],
  };
  assert.ok(stepProblems(d)[3].some((p) => p.includes("short of")));
});
check("step 4 blocks duplicate cheque numbers at the same bank", () => {
  const d: ContractDraft = {
    ...emptyContract, annualRent: 30000,
    cheques: [
      { chequeNo: "100001", bank: "ADCB", amount: 15000, dueDate: today },
      { chequeNo: "100001", bank: "ADCB", amount: 15000, dueDate: plus(180) },
    ],
  };
  assert.ok(stepProblems(d)[3].some((p) => p.includes("same number")));
});
check("step 4 passes when the schedule balances exactly", () => {
  const d: ContractDraft = {
    ...emptyContract, annualRent: 60000,
    cheques: [
      { chequeNo: "100001", bank: "ADCB", amount: 15000, dueDate: today },
      { chequeNo: "100002", bank: "FAB", amount: 15000, dueDate: plus(90) },
      { chequeNo: "100003", bank: "ADCB", amount: 15000, dueDate: plus(180) },
      { chequeNo: "100004", bank: "FAB", amount: 15000, dueDate: plus(270) },
    ],
  };
  assert.deepStrictEqual(stepProblems(d)[3], []);
});
check("step 5 blocks a deposit below the 5% company minimum", () => {
  const d = { ...emptyContract, annualRent: 100000, securityDeposit: 1000 };
  assert.ok(stepProblems(d)[4].some((p) => p.includes("company minimum")));
});
check("step 6 blocks every missing document", () => {
  assert.strictEqual(stepProblems(emptyContract)[5].length, 6);
});
check("step 7 blocks every unticked compliance confirmation", () => {
  assert.strictEqual(stepProblems(emptyContract)[6].length, 5);
});
check("step 8 requires the typed tenant-name confirmation to match", () => {
  const base = { ...emptyContract, tenantName: "Ali Hassan", confirmTargetName: "Ali Hassan" };
  assert.ok(stepProblems({ ...base, confirmName: "Ali Hasan" })[7].length > 0);
  assert.deepStrictEqual(stepProblems({ ...base, confirmName: "ali hassan" })[7], []);
});

/* --------------------------------------------------- cheque deposit rules */
console.log("\nCheque deposit");
const cheque = { chequeNo: "410233", dueDate: today };
const goodDeposit: DepositDraft = {
  chequeId: "CH1", retrieved: true, detailsMatch: true, dateMatch: true,
  bankAccount: "FAB — Collections 1094 (main rent account)", depositSlipNo: "DS-482910",
  depositDate: today, confirmChequeNo: "410233", method: "counter", note: "",
};
check("blocks continuing until the physical cheque is verified", () => {
  assert.strictEqual(depositProblems({ ...goodDeposit, retrieved: false }, cheque)[0].length, 1);
});
check("rejects a future deposit date", () => {
  assert.ok(depositProblems({ ...goodDeposit, depositDate: plus(3) }, cheque)[1].some((p) => p.includes("future")));
});
check("rejects a back-dated deposit beyond 14 days", () => {
  assert.ok(depositProblems({ ...goodDeposit, depositDate: plus(-20) }, cheque)[1].some((p) => p.includes("manager")));
});
check("rejects a mistyped cheque number", () => {
  assert.ok(depositProblems({ ...goodDeposit, confirmChequeNo: "410234" }, cheque)[2].length > 0);
});
check("accepts a correctly completed deposit", () => {
  assert.deepStrictEqual(depositProblems(goodDeposit, cheque).flat(), []);
});

console.log("\nCheque return");
check("requires the tenant to be informed before recording a return", () => {
  const d = {
    chequeId: "CH1", returnDate: today, reason: "Insufficient funds", bankMemoNo: "RTN-8823",
    bankCharges: 0, tenantInformed: false, informedVia: "" as const, replacementRequired: true,
    replacementDeadline: plus(3), confirmChequeNo: "410233", note: "",
  };
  assert.ok(bounceProblems(d, cheque)[2].some((p) => p.includes("informed")));
});

/* ------------------------------------------------------- maintenance rules */
console.log("\nMaintenance intake");
const maint: MaintenanceDraft = {
  propertyId: "P1", unitId: "UN1", tenantConfirmed: true, category: "Plumbing",
  description: "Kitchen sink draining slowly and water backing up into the basin.",
  priority: "medium", reportedVia: "call", accessArrangement: "key_with_office",
  accessNotes: "Key signed out", safetyRisk: false, safetyNotes: "",
  vendor: "AquaFix Plumbing", quoteAmount: 400, quoteAttached: false, confirmUnit: "1204",
};
check("rejects a description shorter than 20 characters", () => {
  assert.ok(maintenanceProblems({ ...maint, description: "broken" }, "1204")[1].some((p) => p.includes("20 characters")));
});
check("requires a quotation once spend reaches AED 1,000", () => {
  assert.ok(maintenanceProblems({ ...maint, quoteAmount: 2500 }, "1204")[3].some((p) => p.includes("quotation")));
});
check("requires the unit number to be typed back", () => {
  assert.ok(maintenanceProblems({ ...maint, confirmUnit: "1205" }, "1204")[4].length > 0);
});
check("accepts a complete work order", () => {
  assert.deepStrictEqual(maintenanceProblems(maint, "1204").flat(), []);
});

/* ---------------------------------------------------------- renewal rules */
console.log("\nRenewal");
const renewal: RenewalDraft = {
  contractId: "C1", reviewedHistory: true, reviewedMaintenance: true, outcome: "renew",
  nonRenewalReason: "", noticeServed: false, newRent: 66000, rentJustification: "",
  startDate: plus(30), termMonths: 12, chequeCount: 4,
  cheques: [
    { chequeNo: "500001", bank: "ADCB", amount: 16500, dueDate: plus(30) },
    { chequeNo: "500002", bank: "ADCB", amount: 16500, dueDate: plus(120) },
    { chequeNo: "500003", bank: "ADCB", amount: 16500, dueDate: plus(210) },
    { chequeNo: "500004", bank: "ADCB", amount: 16500, dueDate: plus(300) },
  ],
  tenantAgreed: true, agreedVia: "signed",
  docs: { renewalAddendum: true, eid: true, ejari: true, cheques: true },
  confirmRef: "CTR-2025-0001", notes: "",
};
const ctx = { currentRent: 60000, contractRef: "CTR-2025-0001", endDate: plus(29) };
check("allows an increase of exactly 5% with no justification",
  () => assert.deepStrictEqual(renewalProblems({ ...renewal, newRent: 63000, cheques: renewal.cheques.map((c) => ({ ...c, amount: 15750 })) }, ctx)[2], []));
check("demands a justification when the increase exceeds the 5% cap", () => {
  assert.ok(renewalProblems(renewal, ctx)[2].some((p) => p.includes("above the 5% cap")));
});
check("accepts an above-cap increase once justified in writing", () => {
  const d = { ...renewal, rentJustification: "Unit fully refurbished in March 2026, comparables let at 68,000." };
  assert.deepStrictEqual(renewalProblems(d, ctx)[2], []);
});
check("requires the 90-day notice before a non-renewal can proceed", () => {
  const d = { ...renewal, outcome: "not_renew" as const, nonRenewalReason: "Owner requires the unit" };
  assert.ok(renewalProblems(d, ctx)[1].some((p) => p.includes("90-day")));
});

console.log(`\n${pass} checks passed`);

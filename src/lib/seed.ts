import {
  AuditEntry,
  Approval,
  Cheque,
  Contract,
  DB,
  MaintenanceRequest,
  Payment,
  Property,
  Task,
  Tenant,
  Unit,
  UnitType,
  User,
} from "./types";
import { addDays, addMonths, addYears, daysFromToday, int, iso, pick, rng, today } from "./utils";

const BANKS = ["ADCB", "FAB", "Emirates NBD", "ADIB", "Mashreq", "RAKBANK", "DIB", "HSBC"] as const;

const FIRST = [
  "Ahmed", "Mohammed", "Khalid", "Saeed", "Rashid", "Omar", "Yousef", "Hamdan", "Ali", "Faisal",
  "Fatima", "Aisha", "Mariam", "Noura", "Hessa", "Shamma", "Latifa", "Sara",
  "Rajesh", "Anil", "Suresh", "Deepak", "Vikram", "Arjun", "Priya", "Anita", "Meera", "Kavya",
  "Juan", "Mark", "Ronald", "Grace", "Maria", "Jessica", "Michael", "David", "Sophie", "Elena",
  "Imran", "Bilal", "Usman", "Hassan", "Tariq", "Nadia", "Ayesha", "Zainab",
];
const LAST = [
  "Al Mansoori", "Al Zaabi", "Al Hosani", "Al Nuaimi", "Al Ketbi", "Al Marzooqi", "Al Suwaidi",
  "Sharma", "Nair", "Patel", "Kumar", "Menon", "Reddy", "Iyer", "Das",
  "Santos", "Reyes", "Cruz", "Garcia", "Dela Cruz",
  "Khan", "Ahmed", "Malik", "Siddiqui", "Rahman", "Chowdhury",
  "Smith", "Brown", "Miller", "Novak", "Petrov", "Dubois",
];
const COMPANIES = [
  "Gulf Horizon Trading LLC", "Emirates Tech Solutions LLC", "Falcon Logistics FZE",
  "Desert Rose Interiors LLC", "Blue Wave Marine Services", "Northern Star Contracting LLC",
  "Sunrise Medical Centre", "Prime Facility Management LLC", "Oasis Catering Services",
  "Silverline Consultancy FZ-LLC",
];
const NATIONALITIES = [
  "UAE", "India", "Pakistan", "Philippines", "Egypt", "Jordan", "Syria", "UK", "Lebanon", "Bangladesh",
];

const MAINT_CATEGORIES = [
  "Air Conditioning", "Plumbing", "Electrical", "Carpentry", "Painting",
  "Appliance Repair", "Pest Control", "Common Area", "Lift / Elevator", "Water Leakage",
];

const PROPERTY_SPECS: {
  name: string; code: string; area: string; owner: string; floors: number; units: number; year: number;
}[] = [
  { name: "Al Manara Tower", code: "AMT", area: "Al Reem Island", owner: "Al Manara Holdings LLC", floors: 24, units: 96, year: 2016 },
  { name: "Marina Heights Residence", code: "MHR", area: "Al Raha Beach", owner: "Al Manara Holdings LLC", floors: 21, units: 84, year: 2018 },
  { name: "Golden Sands Building", code: "GSB", area: "Al Khalidiyah", owner: "Sands Real Estate Est.", floors: 18, units: 72, year: 2012 },
  { name: "Pearl Court", code: "PRC", area: "Mussafah", owner: "Pearl Investments LLC", floors: 15, units: 60, year: 2014 },
  { name: "Corniche Plaza", code: "CNP", area: "Corniche Road", owner: "Al Manara Holdings LLC", floors: 20, units: 78, year: 2019 },
  { name: "Yas Gardens Villas", code: "YGV", area: "Yas Island", owner: "Yas Gardens Development", floors: 2, units: 60, year: 2021 },
];

const UNIT_MIX: { type: UnitType; weight: number; size: [number, number]; rent: [number, number]; baths: number }[] = [
  { type: "Studio", weight: 22, size: [420, 560], rent: [32000, 44000], baths: 1 },
  { type: "1BR", weight: 34, size: [640, 880], rent: [46000, 62000], baths: 1 },
  { type: "2BR", weight: 26, size: [980, 1320], rent: [68000, 92000], baths: 2 },
  { type: "3BR", weight: 12, size: [1400, 1900], rent: [98000, 135000], baths: 3 },
  { type: "Retail", weight: 3, size: [700, 1600], rent: [110000, 220000], baths: 1 },
  { type: "Office", weight: 3, size: [800, 1800], rent: [90000, 180000], baths: 1 },
];

function weightedType(r: () => number): (typeof UNIT_MIX)[number] {
  const total = UNIT_MIX.reduce((s, u) => s + u.weight, 0);
  let x = r() * total;
  for (const u of UNIT_MIX) {
    x -= u.weight;
    if (x <= 0) return u;
  }
  return UNIT_MIX[0];
}

export const USERS: User[] = [
  { id: "U1", name: "Ahmed Al Mansoori", email: "ahmed@almanara.ae", role: "admin", title: "Systems Administrator", active: true },
  { id: "U2", name: "Fatima Al Zaabi", email: "fatima@almanara.ae", role: "manager", title: "General Manager", active: true },
  { id: "U3", name: "Rashid Al Hosani", email: "rashid@almanara.ae", role: "manager", title: "Operations Manager", active: true },
  { id: "U4", name: "Priya Nair", email: "priya@almanara.ae", role: "accountant", title: "Senior Accountant", active: true },
  { id: "U5", name: "Omar Haddad", email: "omar@almanara.ae", role: "accountant", title: "Accounts Officer", active: true },
  { id: "U6", name: "Sara Khalifa", email: "sara@almanara.ae", role: "leasing", title: "Leasing Executive", active: true },
  { id: "U7", name: "Yousef Ibrahim", email: "yousef@almanara.ae", role: "leasing", title: "Leasing Executive", active: true },
  { id: "U8", name: "Mohammed Riaz", email: "riaz@almanara.ae", role: "maintenance", title: "Maintenance Supervisor", active: true },
  { id: "U9", name: "Layla Ahmed", email: "layla@almanara.ae", role: "viewer", title: "Internal Auditor", active: true },
];

const LEASING = ["U6", "U7"];
const ACCOUNTS = ["U4", "U5"];

function pad(n: number, w: number) {
  return String(n).padStart(w, "0");
}

export function generate(): DB {
  const r = rng(20260801);
  const t = today();

  // ---------- properties & units ----------
  const properties: Property[] = PROPERTY_SPECS.map((p, i) => ({
    id: "P" + (i + 1),
    name: p.name,
    code: p.code,
    address: `${p.name}, ${p.area}`,
    city: "Abu Dhabi",
    area: p.area,
    owner: p.owner,
    floors: p.floors,
    yearBuilt: p.year,
    managerId: i % 2 === 0 ? "U3" : "U2",
  }));

  const units: Unit[] = [];
  let uid = 1;
  properties.forEach((p, pi) => {
    const spec = PROPERTY_SPECS[pi];
    const perFloor = Math.ceil(spec.units / spec.floors);
    for (let i = 0; i < spec.units; i++) {
      const floor = Math.min(spec.floors, Math.floor(i / perFloor) + 1);
      const mix = weightedType(r);
      units.push({
        id: "UN" + uid++,
        propertyId: p.id,
        unitNo: `${floor}${pad((i % perFloor) + 1, 2)}`,
        floor,
        type: mix.type,
        sizeSqft: int(r, mix.size[0], mix.size[1]),
        bathrooms: mix.baths,
        marketRent: Math.round(int(r, mix.rent[0], mix.rent[1]) / 500) * 500,
        status: "vacant",
        parkingSlots: mix.type === "Studio" ? 1 : mix.type === "3BR" ? 2 : 1,
      });
    }
  });

  // ---------- tenants + contracts ----------
  const tenants: Tenant[] = [];
  const contracts: Contract[] = [];
  const cheques: Cheque[] = [];
  const payments: Payment[] = [];
  const audit: AuditEntry[] = [];

  let tid = 1, cid = 1, chid = 1, payid = 1, aid = 1;
  const chequeSeqByBank: Record<string, number> = {};

  const occupancyTarget = 0.885;
  const shuffled = [...units].sort(() => r() - 0.5);
  const leasedUnits = shuffled.slice(0, Math.round(units.length * occupancyTarget));
  const rest = shuffled.slice(leasedUnits.length);
  // a handful of remaining units go under maintenance / reserved
  rest.forEach((u, i) => {
    if (i < 6) u.status = "maintenance";
    else if (i < 12) u.status = "reserved";
  });

  const docTemplate = () => [
    { key: "eid", label: "Emirates ID (front & back)", provided: true, ref: "EID-scan.pdf" },
    { key: "passport", label: "Passport copy", provided: true, ref: "passport.pdf" },
    { key: "visa", label: "Residence visa page", provided: true, ref: "visa.pdf" },
    { key: "contract", label: "Signed tenancy contract", provided: true, ref: "signed-contract.pdf" },
    { key: "cheques", label: "Cheque images (all)", provided: true, ref: "cheques.pdf" },
  ];

  for (const unit of leasedUnits) {
    const isCompany = unit.type === "Retail" || unit.type === "Office" ? r() < 0.85 : r() < 0.04;
    const name = isCompany
      ? pick(r, COMPANIES) + " (" + int(r, 10, 99) + ")"
      : `${pick(r, FIRST)} ${pick(r, LAST)}`;
    const tenant: Tenant = {
      id: "T" + tid++,
      name,
      kind: isCompany ? "company" : "individual",
      emiratesId: `784-${int(r, 1975, 2004)}-${pad(int(r, 1, 9999999), 7)}-${int(r, 1, 9)}`,
      passportNo: String.fromCharCode(65 + int(r, 0, 25)) + pad(int(r, 100000, 9999999), 7),
      nationality: isCompany ? "UAE" : pick(r, NATIONALITIES),
      phone: `+9715${int(r, 0, 9)}${pad(int(r, 0, 9999999), 7)}`,
      email: name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 24) + "@mail.com",
      tradeLicense: isCompany ? "CN-" + int(r, 1000000, 9999999) : undefined,
      createdAt: new Date().toISOString(),
    };
    tenants.push(tenant);

    // start date spread across the last 12 months so renewals & cheques are staggered
    const startOffset = -int(r, 5, 360);
    const startDate = addDays(t, startOffset);
    const endDate = addDays(addYears(startDate, 1), -1);
    const annualRent = Math.round((unit.marketRent * (0.92 + r() * 0.12)) / 500) * 500;
    const chequeCount = pick(r, [4, 4, 4, 4, 4, 2, 1, 6, 12]);
    const createdBy = pick(r, LEASING);

    const contract: Contract = {
      id: "C" + cid,
      ref: `CTR-${new Date(startDate).getFullYear()}-${pad(cid, 4)}`,
      unitId: unit.id,
      tenantId: tenant.id,
      startDate,
      endDate,
      annualRent,
      chequeCount,
      securityDeposit: Math.round(annualRent * 0.05),
      commission: Math.round(annualRent * 0.05),
      ejariNo: String(int(r, 100000000000, 999999999999)),
      status: "active",
      createdBy,
      createdAt: addDays(startDate, -int(r, 3, 20)) + "T09:00:00.000Z",
      approvedBy: r() < 0.5 ? "U2" : "U3",
      approvedAt: addDays(startDate, -int(r, 1, 3)) + "T11:00:00.000Z",
      documents: docTemplate(),
    };
    if (daysFromToday(endDate) <= 90 && daysFromToday(endDate) >= 0) contract.status = "expiring";
    contracts.push(contract);
    cid++;
    unit.status = "occupied";

    // ---------- cheque schedule ----------
    const monthsApart = 12 / chequeCount;
    const base = Math.floor(annualRent / chequeCount / 100) * 100;
    for (let i = 0; i < chequeCount; i++) {
      const amount = i === chequeCount - 1 ? annualRent - base * (chequeCount - 1) : base;
      const dueDate = addMonths(startDate, Math.round(i * monthsApart));
      const bank = pick(r, BANKS);
      chequeSeqByBank[bank] = (chequeSeqByBank[bank] ?? int(r, 100000, 400000)) + int(r, 1, 4);
      const cheque: Cheque = {
        id: "CH" + chid++,
        contractId: contract.id,
        seq: i + 1,
        ofTotal: chequeCount,
        chequeNo: pad(chequeSeqByBank[bank], 6),
        bank,
        amount,
        dueDate,
        status: "pending",
      };

      const overdueDays = -daysFromToday(dueDate);
      const bank_ = bank;
      const clear = (depositLagMin: number, depositLagMax: number) => {
        cheque.status = "cleared";
        cheque.depositedAt = addDays(dueDate, int(r, depositLagMin, depositLagMax));
        cheque.depositedBy = pick(r, ACCOUNTS);
        cheque.depositSlipNo = "DS-" + int(r, 100000, 999999);
        cheque.clearedAt = addDays(cheque.depositedAt, int(r, 1, 3));
        payments.push({
          id: "PY" + payid,
          receiptNo: `RCP-${pad(payid, 5)}`,
          contractId: contract.id,
          chequeId: cheque.id,
          amount,
          method: "cheque",
          category: "rent",
          receivedAt: cheque.clearedAt,
          receivedBy: cheque.depositedBy!,
          reference: `${bank_} / ${cheque.chequeNo}`,
        });
        payid++;
      };
      const bank_return = () => {
        cheque.status = "bounced";
        cheque.depositedAt = addDays(dueDate, int(r, 0, 2));
        cheque.depositedBy = pick(r, ACCOUNTS);
        cheque.depositSlipNo = "DS-" + int(r, 100000, 999999);
        cheque.bouncedAt = addDays(cheque.depositedAt, int(r, 1, 3));
        cheque.bounceReason = pick(r, [
          "Insufficient funds",
          "Account closed",
          "Signature mismatch",
          "Payment stopped by drawer",
          "Post-dated cheque presented early",
        ]);
      };

      if (overdueDays >= 0) {
        const roll = r();
        if (overdueDays <= 12) {
          // recently due — most are in the bank waiting to clear
          if (roll < 0.62) {
            cheque.status = "deposited";
            cheque.depositedAt = addDays(dueDate, int(r, 0, 2));
            cheque.depositedBy = pick(r, ACCOUNTS);
            cheque.depositSlipNo = "DS-" + int(r, 100000, 999999);
          } else if (roll < 0.9) clear(0, 2);
          else if (roll < 0.95) bank_return();
          else cheque.status = "pending"; // leakage: due, still in the safe
        } else if (overdueDays <= 90) {
          // the last quarter — where unbanked cheques realistically still sit
          if (roll < 0.895) clear(0, 2);
          else if (roll < 0.92) clear(4, 16); // banked late but recovered
          else if (roll < 0.95) bank_return();
          else if (roll < 0.962) {
            // deposited a while ago and still not cleared — chased by the system
            cheque.status = "deposited";
            cheque.depositedAt = addDays(dueDate, int(r, 0, 2));
            cheque.depositedBy = pick(r, ACCOUNTS);
            cheque.depositSlipNo = "DS-" + int(r, 100000, 999999);
          } else {
            cheque.status = "pending"; // *** leakage: never banked ***
          }
        } else {
          // older than a quarter — everything was eventually resolved
          if (roll < 0.97) clear(0, 2);
          else clear(4, 18);
        }
      }
      cheques.push(cheque);
    }

    // deposit + commission payments at contract start
    if (daysFromToday(startDate) <= 0) {
      payments.push({
        id: "PY" + payid, receiptNo: `RCP-${pad(payid, 5)}`, contractId: contract.id,
        amount: contract.securityDeposit, method: "bank_transfer", category: "deposit",
        receivedAt: startDate, receivedBy: createdBy, reference: "Security deposit",
      });
      payid++;
    }
  }

  // ---------- a few contracts sitting in the approval queue ----------
  const vacantForDrafts = units.filter((u) => u.status === "vacant").slice(0, 5);
  const approvals: Approval[] = [];
  let apid = 1;
  vacantForDrafts.forEach((unit, i) => {
    const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
    const tenant: Tenant = {
      id: "T" + tid++, name, kind: "individual",
      emiratesId: `784-${int(r, 1980, 2002)}-${pad(int(r, 1, 9999999), 7)}-${int(r, 1, 9)}`,
      passportNo: "P" + pad(int(r, 100000, 9999999), 7),
      nationality: pick(r, NATIONALITIES),
      phone: `+9715${int(r, 0, 9)}${pad(int(r, 0, 9999999), 7)}`,
      email: name.toLowerCase().replace(/\s+/g, ".") + "@mail.com",
      createdAt: new Date().toISOString(),
    };
    tenants.push(tenant);
    const startDate = addDays(t, int(r, 3, 25));
    const annualRent = unit.marketRent;
    const contract: Contract = {
      id: "C" + cid,
      ref: `CTR-2026-${pad(cid, 4)}`,
      unitId: unit.id, tenantId: tenant.id, startDate,
      endDate: addDays(addYears(startDate, 1), -1),
      annualRent, chequeCount: 4,
      securityDeposit: Math.round(annualRent * 0.05),
      commission: Math.round(annualRent * 0.05),
      ejariNo: String(int(r, 100000000000, 999999999999)),
      status: "pending_approval",
      createdBy: LEASING[i % 2],
      createdAt: addDays(t, -int(r, 0, 4)) + "T10:15:00.000Z",
      documents: docTemplate(),
    };
    contracts.push(contract);
    unit.status = "reserved";
    const base = Math.floor(annualRent / 4 / 100) * 100;
    for (let k = 0; k < 4; k++) {
      const bank = pick(r, BANKS);
      chequeSeqByBank[bank] = (chequeSeqByBank[bank] ?? 200000) + int(r, 1, 4);
      cheques.push({
        id: "CH" + chid++, contractId: contract.id, seq: k + 1, ofTotal: 4,
        chequeNo: pad(chequeSeqByBank[bank], 6), bank,
        amount: k === 3 ? annualRent - base * 3 : base,
        dueDate: addMonths(startDate, k * 3), status: "pending",
      });
    }
    approvals.push({
      id: "AP" + apid,
      ref: `APR-${pad(apid, 4)}`,
      type: "new_contract",
      title: `New tenancy — ${unit.unitNo}, ${properties.find((p) => p.id === unit.propertyId)!.name}`,
      summary: `${tenant.name} · 1 year · ${annualRent.toLocaleString("en-US")} AED · 4 cheques`,
      entityType: "contract", entityId: contract.id, amount: annualRent,
      requestedBy: contract.createdBy, requestedAt: contract.createdAt,
      status: "pending",
    });
    apid++;
    cid++;
  });

  // ---------- maintenance ----------
  const maintenance: MaintenanceRequest[] = [];
  const occupied = units.filter((u) => u.status === "occupied");
  for (let i = 0; i < 64; i++) {
    const unit = pick(r, occupied);
    const contract = contracts.find((c) => c.unitId === unit.id);
    const reportedAt = addDays(t, -int(r, 0, 45));
    const priority = pick(r, ["low", "medium", "medium", "high", "high", "emergency"] as const);
    const slaDays = priority === "emergency" ? 1 : priority === "high" ? 2 : priority === "medium" ? 5 : 10;
    const age = -daysFromToday(reportedAt);
    let status: MaintenanceRequest["status"] = "new";
    const roll = r();
    if (age > 12) status = roll < 0.85 ? "closed" : "completed";
    else if (age > 5) status = roll < 0.4 ? "completed" : roll < 0.7 ? "in_progress" : "awaiting_approval";
    else if (age > 2) status = roll < 0.5 ? "in_progress" : "assigned";
    else status = roll < 0.5 ? "new" : "assigned";

    maintenance.push({
      id: "M" + (i + 1),
      ref: `WO-${pad(1200 + i, 4)}`,
      unitId: unit.id,
      tenantId: contract?.tenantId,
      category: pick(r, MAINT_CATEGORIES),
      priority,
      description: pick(r, [
        "AC not cooling in the master bedroom.",
        "Kitchen sink draining very slowly, water backing up.",
        "Bathroom light flickering and tripping the breaker.",
        "Wardrobe door hinge broken, does not close.",
        "Water leakage from the ceiling near the balcony door.",
        "Washing machine not draining properly.",
        "Main door lock jamming intermittently.",
        "Cockroaches reported in the kitchen area.",
        "Corridor lights on floor not working.",
        "Lift making loud noise between floors.",
      ]),
      status,
      reportedAt: reportedAt + "T08:30:00.000Z",
      reportedBy: contract?.tenantId ?? "walk-in",
      assignedTo: status === "new" ? undefined : "U8",
      vendor: status === "new" ? undefined : pick(r, ["Cool Breeze AC LLC", "In-house team", "AquaFix Plumbing", "BrightSpark Electrical", "PestGuard UAE"]),
      quoteAmount: status === "new" ? undefined : int(r, 150, 4800),
      completedAt: status === "completed" || status === "closed" ? addDays(reportedAt, int(r, 1, 8)) : undefined,
      slaDueAt: addDays(reportedAt, slaDays),
      resolutionNotes: status === "closed" ? "Work completed and verified with tenant." : undefined,
    });
  }

  // maintenance spend approvals
  maintenance
    .filter((m) => m.status === "awaiting_approval")
    .slice(0, 4)
    .forEach((m) => {
      const unit = units.find((u) => u.id === m.unitId)!;
      approvals.push({
        id: "AP" + apid, ref: `APR-${pad(apid, 4)}`, type: "maintenance_spend",
        title: `Maintenance spend — ${m.ref} (${unit.unitNo})`,
        summary: `${m.category} · ${m.vendor} · quote ${(m.quoteAmount ?? 0).toLocaleString("en-US")} AED`,
        entityType: "maintenance", entityId: m.id, amount: m.quoteAmount,
        requestedBy: "U8",
        requestedAt: addDays(t, -int(r, 0, 3)) + "T09:20:00.000Z",
        status: "pending",
      });
      apid++;
    });

  // cheque replacement approvals for open bounced cheques
  cheques.filter((c) => c.status === "bounced").slice(0, 3).forEach((c) => {
    const contract = contracts.find((x) => x.id === c.contractId)!;
    const tenant = tenants.find((x) => x.id === contract.tenantId)!;
    approvals.push({
      id: "AP" + apid, ref: `APR-${pad(apid, 4)}`, type: "cheque_replacement",
      title: `Replace bounced cheque ${c.chequeNo}`,
      summary: `${tenant.name} · ${c.bank} · ${c.amount.toLocaleString("en-US")} AED · ${c.bounceReason}`,
      entityType: "cheque", entityId: c.id, amount: c.amount,
      requestedBy: "U4",
      requestedAt: addDays(t, -int(r, 0, 3)) + "T12:00:00.000Z",
      status: "pending",
    });
    apid++;
  });

  // a short history of decided items so the manager can see recent decisions
  const decidedSources = contracts.filter((c) => c.status === "active").slice(0, 9);
  decidedSources.forEach((c, i) => {
    const unit = units.find((u) => u.id === c.unitId)!;
    const tenant = tenants.find((x) => x.id === c.tenantId)!;
    const rejected = i % 5 === 4;
    const when = addDays(t, -int(r, 1, 20));
    approvals.push({
      id: "AP" + apid,
      ref: `APR-${pad(apid, 4)}`,
      type: i % 3 === 0 ? "renewal" : i % 3 === 1 ? "new_contract" : "rent_change",
      title: `${i % 3 === 0 ? "Renewal" : i % 3 === 1 ? "New tenancy" : "Rent change"} — ${unit.unitNo}`,
      summary: `${tenant.name} · AED ${c.annualRent.toLocaleString("en-US")}`,
      entityType: "contract",
      entityId: c.id,
      amount: c.annualRent,
      requestedBy: pick(r, LEASING),
      requestedAt: addDays(when, -2) + "T10:00:00.000Z",
      decidedBy: r() < 0.5 ? "U2" : "U3",
      decidedAt: when + "T15:30:00.000Z",
      status: rejected ? "rejected" : "approved",
      decisionNote: rejected
        ? "Rent is below the list price with no written justification. Renegotiate or add the reason."
        : undefined,
    });
    apid++;
  });

  // ---------- tasks ----------
  const tasks: Task[] = [];
  let tkid = 1;
  const addTask = (t2: Omit<Task, "id">) => tasks.push({ id: "TK" + tkid++, ...t2 });

  // deposit tasks for cheques due within 10 days
  cheques
    .filter((c) => c.status === "pending" && daysFromToday(c.dueDate) <= 10)
    .forEach((c) => {
      const contract = contracts.find((x) => x.id === c.contractId)!;
      if (contract.status === "pending_approval") return;
      const tenant = tenants.find((x) => x.id === contract.tenantId)!;
      const unit = units.find((u) => u.id === contract.unitId)!;
      const overdue = daysFromToday(c.dueDate) < 0;
      addTask({
        title: `Deposit cheque ${c.chequeNo} — ${unit.unitNo}`,
        detail: `${tenant.name} · ${c.bank} · AED ${c.amount.toLocaleString("en-US")} · cheque ${c.seq} of ${c.ofTotal}`,
        assignedTo: ACCOUNTS[Number(c.id.slice(2)) % 2],
        dueDate: c.dueDate,
        status: overdue ? "overdue" : "open",
        priority: overdue ? "high" : "medium",
        entityType: "cheque", entityId: c.id,
        createdAt: addDays(c.dueDate, -7) + "T07:00:00.000Z",
        source: "system",
      });
    });

  // renewal tasks
  contracts
    .filter((c) => c.status === "expiring")
    .forEach((c, i) => {
      const tenant = tenants.find((x) => x.id === c.tenantId)!;
      const unit = units.find((u) => u.id === c.unitId)!;
      const d = daysFromToday(c.endDate);
      // the reminder is raised 60 days out; if that date has already passed the
      // task carries a fresh deadline, and only a few are genuinely late
      let due = addDays(c.endDate, -60);
      if (daysFromToday(due) < 0) {
        due = r() < 0.12 ? addDays(t, -int(r, 1, 5)) : addDays(t, int(r, 1, 12));
      }
      addTask({
        title: `Start renewal — ${unit.unitNo} (${c.ref})`,
        detail: `${tenant.name} · expires ${c.endDate} · ${d} days left`,
        assignedTo: LEASING[i % 2],
        dueDate: due,
        status: daysFromToday(due) < 0 ? "overdue" : "open",
        priority: d < 30 ? "high" : "medium",
        entityType: "contract", entityId: c.id,
        createdAt: addDays(c.endDate, -90) + "T07:00:00.000Z",
        source: "system",
      });
    });

  // bounced cheque follow-ups
  cheques.filter((c) => c.status === "bounced").forEach((c, i) => {
    const contract = contracts.find((x) => x.id === c.contractId)!;
    const tenant = tenants.find((x) => x.id === contract.tenantId)!;
    addTask({
      title: `Collect replacement for bounced cheque ${c.chequeNo}`,
      detail: `${tenant.name} · ${c.bounceReason} · AED ${c.amount.toLocaleString("en-US")}`,
      assignedTo: ACCOUNTS[i % 2],
      dueDate: addDays(c.bouncedAt ?? t, 3),
      status: daysFromToday(addDays(c.bouncedAt ?? t, 3)) < 0 ? "overdue" : "open",
      priority: "high",
      entityType: "cheque", entityId: c.id,
      createdAt: (c.bouncedAt ?? t) + "T09:00:00.000Z",
      source: "system",
    });
  });

  // maintenance follow-ups
  maintenance.filter((m) => m.status !== "closed" && m.status !== "completed").forEach((m) => {
    const unit = units.find((u) => u.id === m.unitId)!;
    addTask({
      title: `${m.ref} — ${m.category} at ${unit.unitNo}`,
      detail: m.description,
      assignedTo: "U8",
      dueDate: m.slaDueAt,
      status: daysFromToday(m.slaDueAt) < 0 ? "overdue" : "open",
      priority: m.priority === "emergency" ? "high" : m.priority === "high" ? "high" : "medium",
      entityType: "maintenance", entityId: m.id,
      createdAt: m.reportedAt,
      source: "system",
    });
  });

  // manager review tasks
  approvals.filter((a) => a.status === "pending").forEach((a) => {
    addTask({
      title: `Review approval ${a.ref}`,
      detail: a.title,
      assignedTo: "U2",
      dueDate: addDays(a.requestedAt.slice(0, 10), 2),
      status: daysFromToday(addDays(a.requestedAt.slice(0, 10), 2)) < 0 ? "overdue" : "open",
      priority: "high",
      entityType: "approval", entityId: a.id,
      createdAt: a.requestedAt,
      source: "system",
    });
  });

  // ---------- audit trail ----------
  const auditActions: [string, string][] = [
    ["contract.created", "Created tenancy contract"],
    ["contract.approved", "Approved tenancy contract"],
    ["cheque.deposited", "Marked cheque as deposited"],
    ["cheque.cleared", "Recorded cheque clearance"],
    ["tenant.updated", "Updated tenant contact details"],
    ["maintenance.assigned", "Assigned work order to vendor"],
    ["payment.recorded", "Recorded payment receipt"],
    ["user.login", "Signed in"],
  ];
  for (let i = 0; i < 260; i++) {
    const user = pick(r, USERS);
    const [action, label] = pick(r, auditActions);
    const when = new Date(Date.now() - int(r, 0, 60 * 24 * 60) * 60000);
    const ent = action.split(".")[0];
    audit.push({
      id: "AU" + aid++,
      at: when.toISOString(),
      actorId: user.id,
      actorName: user.name,
      action,
      entityType: ent,
      entityId:
        ent === "cheque" ? pick(r, cheques).id :
        ent === "contract" ? pick(r, contracts).id :
        ent === "tenant" ? pick(r, tenants).id :
        ent === "maintenance" ? pick(r, maintenance).id :
        ent === "payment" ? pick(r, payments).id : user.id,
      summary: label,
      ip: `10.0.${int(r, 0, 4)}.${int(r, 2, 240)}`,
    });
  }
  audit.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    users: USERS,
    properties,
    units,
    tenants,
    contracts,
    cheques,
    payments,
    maintenance,
    approvals,
    tasks,
    audit,
    counters: { contract: cid, cheque: chid, approval: apid, task: tkid, audit: aid, payment: payid, tenant: tid },
  };
}

export const _unused = { iso };

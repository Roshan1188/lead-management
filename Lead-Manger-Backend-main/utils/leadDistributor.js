// leadDistributor.js

/**
 * Production-grade lead distribution utilities
 *
 * Backward-compatible:
 *   - distributeLeads(leads, telecallers, "shuffle" | "sequence" | "date")
 *
 * New, powerful planner for preview/apply flows:
 *   - planDistribution(leads, telecallers, options)
 *     options = {
 *       strategy?: 'shuffle' | 'round_robin' | 'oldest_first' | 'newest_first' | 'least_loaded' | 'sequence' | 'date',
 *       seed?: number,              // deterministic shuffle when strategy='shuffle'
 *       limit?: number,             // max leads to assign
 *       statuses?: string[],        // include only these lead statuses
 *       onlyUnassigned?: boolean,   // default true
 *       respectBlocked?: boolean,   // default true (ignore blocked telecallers)
 *       perTeleCap?: number,        // cap = alreadyAssigned + willAssign <= perTeleCap
 *       loadById?: Record<string,number>,  // current active load per telecaller
 *       previousIndex?: number,     // for round-robin continuity
 *     }
 *
 * planDistribution returns:
 *   {
 *     strategy, planned, consideredLeads,
 *     breakdown: [{ telecallerId, name, mobile, blocked, alreadyAssigned, willAssign, capacityLeft }],
 *     assignments: [{ leadId, telecallerId }],
 *     nextIndex,                      // next cursor if you want to persist round-robin continuity
 *     sampleLeadIds                   // small sample of affected leads (for preview UI)
 *   }
 *
 * Helper (legacy) to just get updated lead objects ready for bulkWrite:
 *   - distributeLeadsFromPlan(leads, plan) -> leadsWithAssignedTo
 */

const isObjIdEqual = (a, b) => String(a) === String(b);

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const seededShuffle = (arr, seed = Date.now()) => {
  const rnd = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const sortByDateAsc = (items, key) =>
  items.slice().sort((a, b) => new Date(a[key] || 0) - new Date(b[key] || 0));

const sortByDateDesc = (items, key) =>
  items.slice().sort((a, b) => new Date(b[key] || 0) - new Date(a[key] || 0));

/**
 * Prepare telecaller pool with capacity and current load.
 */
function buildTelePool(telecallers, {
  respectBlocked = true,
  perTeleCap,
  loadById = {},
} = {}) {
  const pool = [];
  for (const t of telecallers || []) {
    if (respectBlocked && t.blocked) continue;
    const id = String(t._id ?? t.id ?? t);
    const alreadyAssigned = Number(loadById[id] ?? 0);
    const capLeft = typeof perTeleCap === "number"
      ? Math.max(0, perTeleCap - alreadyAssigned)
      : Number.POSITIVE_INFINITY;
    pool.push({
      id,
      name: t.name,
      mobile: t.mobile,
      blocked: !!t.blocked,
      alreadyAssigned,
      willAssign: 0,
      capacityLeft: capLeft,
    });
  }
  return pool;
}

function pickNextRoundRobin(pool, startIndex = 0) {
  if (!pool.length) return { index: -1, nextIndex: 0 };
  let i = startIndex;
  for (let step = 0; step < pool.length; step++) {
    const idx = (i + step) % pool.length;
    if (pool[idx].capacityLeft > 0) {
      const nextIndex = (idx + 1) % pool.length;
      return { index: idx, nextIndex };
    }
  }
  return { index: -1, nextIndex: startIndex };
}

function pickLeastLoaded(pool) {
  let bestIdx = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (p.capacityLeft <= 0) continue;
    const score = p.alreadyAssigned + p.willAssign; // total load if we assign one more
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Core planner
 */
export function planDistribution(rawLeads, rawTelecallers, opts = {}) {
  const {
    strategy: rawStrat = "shuffle",
    seed,
    limit,
    statuses,
    onlyUnassigned = true,
    respectBlocked = true,
    perTeleCap,
    loadById,
    previousIndex = 0,
  } = opts;

  // Normalize strategy (support legacy aliases)
  const strategy =
    rawStrat === "sequence" ? "round_robin"
      : rawStrat === "date" ? "oldest_first"
      : rawStrat;

  // Telecaller pool
  let pool = buildTelePool(rawTelecallers, { respectBlocked, perTeleCap, loadById });

  if (strategy === "shuffle") {
    pool = seed != null ? seededShuffle(pool, seed) : seededShuffle(pool);
  }

  // Leads to consider
  let leads = Array.isArray(rawLeads) ? rawLeads.slice() : [];

  if (onlyUnassigned) {
    leads = leads.filter(l => !l.assignedTo);
  }
  if (Array.isArray(statuses) && statuses.length) {
    const set = new Set(statuses);
    leads = leads.filter(l => set.has(l.status));
  }

  // Sort by strategy
  if (strategy === "oldest_first") {
    leads = sortByDateAsc(leads, "createdAt");
  } else if (strategy === "newest_first") {
    leads = sortByDateDesc(leads, "createdAt");
  } // round_robin, shuffle, least_loaded keep incoming order

  const consideredLeads = leads.length;
  const maxToAssign = typeof limit === "number" ? Math.max(0, Math.min(limit, leads.length)) : leads.length;

  const assignments = [];
  let cursor = previousIndex;

  for (let i = 0; i < leads.length; i++) {
    if (assignments.length >= maxToAssign) break;

    const lead = leads[i];
    let chosenIdx = -1;

    if (strategy === "least_loaded") {
      chosenIdx = pickLeastLoaded(pool);
    } else {
      // round_robin / shuffle / default: iterate RR with live cursor
      const pick = pickNextRoundRobin(pool, cursor);
      chosenIdx = pick.index;
      cursor = pick.nextIndex;
    }

    if (chosenIdx === -1) {
      // No capacity left anywhere
      break;
    }

    const chosen = pool[chosenIdx];
    // Assign one
    chosen.willAssign += 1;
    if (Number.isFinite(chosen.capacityLeft)) chosen.capacityLeft -= 1;

    assignments.push({
      leadId: String(lead._id ?? lead.id),
      telecallerId: chosen.id,
    });
  }

  const breakdown = pool.map(p => ({
    telecallerId: p.id,
    name: p.name,
    mobile: p.mobile,
    blocked: p.blocked,
    alreadyAssigned: p.alreadyAssigned,
    willAssign: p.willAssign,
    capacityLeft: Number.isFinite(p.capacityLeft) ? p.capacityLeft : null,
  }));

  const planned = assignments.length;
  const sampleLeadIds = assignments.slice(0, 10).map(a => a.leadId); // small preview sample

  return {
    strategy,
    consideredLeads,
    planned,
    breakdown,
    assignments,
    nextIndex: cursor,    // persist this if you want RR continuity
    sampleLeadIds,
  };
}

/**
 * Convenience: apply a plan to lead objects (pure, does not mutate input).
 * Returns an array of updated lead objects with assignedTo set.
 */
export function distributeLeadsFromPlan(leads, plan) {
  if (!plan || !Array.isArray(plan.assignments) || !plan.assignments.length) return leads.slice();
  const assignMap = new Map(plan.assignments.map(a => [String(a.leadId), String(a.telecallerId)]));

  return leads.map(l => {
    const id = String(l._id ?? l.id);
    if (assignMap.has(id)) {
      return { ...l, assignedTo: assignMap.get(id) };
    }
    return l;
  });
}

/**
 * Backward-compatible helper.
 * Legacy signature:
 *   distributeLeads(leads, telecallers, method = "shuffle")
 *
 * methods supported (legacy):
 *  - 'shuffle'          -> shuffle telecallers + round_robin
 *  - 'sequence'         -> round_robin (in given telecaller order)
 *  - 'date'             -> oldest_first (lead createdAt asc) + round_robin
 *
 * Returns updated lead objects with assignedTo set (pure).
 */
export const distributeLeads = (leads, telecallers, method = "shuffle") => {
  const strategy =
    method === "sequence" ? "round_robin" :
    method === "date"     ? "oldest_first" :
    "shuffle";

  const plan = planDistribution(leads, telecallers, {
    strategy,
    // legacy: no capacity/load constraints; assign all visible unassigned
    onlyUnassigned: true,
    respectBlocked: true,
  });

  return distributeLeadsFromPlan(leads, plan);
};

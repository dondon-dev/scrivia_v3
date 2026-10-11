import type { Deduction, Employee, PayrollEntry } from '@/types/payroll';

/** One display row: a stored entry joined to its employee masterfile record. */
export interface DisbRow {
  employee: Employee;
  entry: PayrollEntry;
  gross: number;
  totalDeductions: number;
  netPay: number;
}

export interface DisbStation {
  stacode: string;
  payees: number;
  basicTrans: number;
  pera: number;
  aca: number;
  comp: number;
  ded: number;
  net: number;
  glnr: number;
  gmed: number;
  gpag: number;
  gecc: number;
  byCode: Map<string, { name: string; amt: number }>;
}

export interface DisbTotals {
  payees: number;
  basicTrans: number;
  pera: number;
  aca: number;
  comp: number;
  ded: number;
  net: number;
  glnr: number;
  gmed: number;
  gpag: number;
  gecc: number;
}

export interface DisbursementReport {
  list: DisbStation[];
  div: DisbTotals;
  divCodes: [string, { name: string; amt: number }][];
}

/**
 * Disbursement Report — FoxPro SUMREP → SUMSTN/SUMREP2 (Regular Payroll).
 *
 * PAYFILE pass (per station, PAYSUM1): payees, basic+trans, PERA, ACA, total
 * compensation, total deductions, net pay, and the four government shares.
 * basic+trans is the entry gross less the masterfile PERA/ACA split, matching
 * the run engine's gross = basic+trans+pera+aca identity.
 *
 * ITEMDED pass (per dedcode, PAYDCON + PAYDED1): the run's itemized deduction
 * lines already carry both the recorded mandatory shares (0003/0036/0111/0222)
 * and the INCLUDED loan lines, so the breakdown reads them directly, grouped
 * by dedcode within each entry's station. Lines for employees without a stored
 * entry, or from any other source, are excluded — the register is driven by
 * the stored payroll exactly like the FoxPro PAYFILE sort.
 */
export function computeDisbursement(
  rows: DisbRow[],
  deductions: Deduction[],
  empMap: Map<string, Employee>,
): DisbursementReport {
  const stations = new Map<string, DisbStation>();
  const get = (stacode: string): DisbStation => {
    let t = stations.get(stacode);
    if (!t) {
      t = { stacode, payees: 0, basicTrans: 0, pera: 0, aca: 0, comp: 0, ded: 0, net: 0, glnr: 0, gmed: 0, gpag: 0, gecc: 0, byCode: new Map() };
      stations.set(stacode, t);
    }
    return t;
  };
  rows.forEach((r) => {
    const sta = (r.employee.stacode ?? '').trim() || '—';
    const t = get(sta);
    const pera = Number(r.employee.pera) || 0;
    const aca = Number(r.employee.aca) || 0;
    t.payees += 1;
    t.basicTrans += r.gross - pera - aca;
    t.pera += pera;
    t.aca += aca;
    t.comp += r.gross;
    t.ded += r.totalDeductions;
    t.net += r.netPay;
    t.glnr += Number(r.entry.govtlnr) || 0;
    t.gmed += Number(r.entry.govtmed) || 0;
    t.gpag += Number(r.entry.govtpag) || 0;
    t.gecc += Number(r.entry.govtecc) || 0;
  });
  const withEntry = new Set(rows.map((r) => r.employee.id));
  deductions.forEach((d) => {
    if (!withEntry.has(d.employee_id)) return;
    if (d.source !== 'Payroll Run' && d.source !== 'INCLUDED') return;
    const e = empMap.get(d.employee_id);
    const sta = (e?.stacode ?? d.stacode ?? '').trim() || '—';
    const t = get(sta);
    const cur = t.byCode.get(d.deduction_code) ?? { name: d.deduction_name || d.deduction_code, amt: 0 };
    cur.amt += Number(d.amount) || 0;
    if (!cur.name && d.deduction_name) cur.name = d.deduction_name;
    t.byCode.set(d.deduction_code, cur);
  });
  const list = Array.from(stations.values()).sort((a, b) => a.stacode.localeCompare(b.stacode));
  const div: DisbTotals = { payees: 0, basicTrans: 0, pera: 0, aca: 0, comp: 0, ded: 0, net: 0, glnr: 0, gmed: 0, gpag: 0, gecc: 0 };
  const divByCode = new Map<string, { name: string; amt: number }>();
  list.forEach((t) => {
    div.payees += t.payees; div.basicTrans += t.basicTrans; div.pera += t.pera; div.aca += t.aca;
    div.comp += t.comp; div.ded += t.ded; div.net += t.net;
    div.glnr += t.glnr; div.gmed += t.gmed; div.gpag += t.gpag; div.gecc += t.gecc;
    t.byCode.forEach((v, code) => {
      const cur = divByCode.get(code) ?? { name: v.name, amt: 0 };
      cur.amt += v.amt;
      divByCode.set(code, cur);
    });
  });
  return { list, div, divCodes: Array.from(divByCode.entries()).sort((a, b) => a[0].localeCompare(b[0])) };
}

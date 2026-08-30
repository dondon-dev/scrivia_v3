import { useState, useMemo } from 'react';
import {
  Search, BookOpen, FileText, Download, ChevronDown, ChevronRight,
  Landmark, HeartPulse, Home, Shield, GraduationCap, Receipt,
  Building2, ScrollText, ExternalLink, Printer, Calendar, Tag, Filter,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type AgencyId = 'coa' | 'dbm' | 'gsis' | 'pagibig' | 'philhealth' | 'csc' | 'deped' | 'bir';
type TopicId = 'salary' | 'wages' | 'benefits' | 'premiums' | 'govt_benefits' | 'retirement' | 'taxation' | 'compliance';

interface PolicyMemo {
  id: string;
  title: string;
  agency: AgencyId;
  topics: TopicId[];
  date: string;
  refNumber: string;
  summary: string;
  keyProvisions: string[];
  effectiveDate?: string;
  relevance: 'high' | 'medium' | 'low';
  category: 'circular' | 'memorandum' | 'resolution' | 'order' | 'regulation' | 'guideline';
}

// ── Agency & Topic Metadata ──────────────────────────────────────────────────

const AGENCIES: Record<AgencyId, { label: string; icon: typeof Landmark; color: string; bgColor: string }> = {
  coa: { label: 'Commission on Audit (COA)', icon: Landmark, color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
  dbm: { label: 'Dept. of Budget & Management (DBM)', icon: Building2, color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200' },
  gsis: { label: 'GSIS', icon: Shield, color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200' },
  pagibig: { label: 'Pag-IBIG Fund', icon: Home, color: 'text-pink-700', bgColor: 'bg-pink-50 border-pink-200' },
  philhealth: { label: 'PhilHealth', icon: HeartPulse, color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' },
  csc: { label: 'Civil Service Commission (CSC)', icon: ScrollText, color: 'text-violet-700', bgColor: 'bg-violet-50 border-violet-200' },
  deped: { label: 'DepEd', icon: GraduationCap, color: 'text-teal-700', bgColor: 'bg-teal-50 border-teal-200' },
  bir: { label: 'Bureau of Internal Revenue (BIR)', icon: Receipt, color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
};

const TOPICS: Record<TopicId, { label: string; icon: typeof Tag }> = {
  salary: { label: 'Salary', icon: Tag },
  wages: { label: 'Wages', icon: Tag },
  benefits: { label: 'Benefits', icon: Tag },
  premiums: { label: 'Premiums', icon: Tag },
  govt_benefits: { label: 'Govt Benefits', icon: Tag },
  retirement: { label: 'Retirement', icon: Tag },
  taxation: { label: 'Taxation', icon: Tag },
  compliance: { label: 'Compliance', icon: Tag },
};

const CATEGORY_LABELS: Record<string, string> = {
  circular: 'Circular',
  memorandum: 'Memorandum',
  resolution: 'Resolution',
  order: 'Executive Order',
  regulation: 'Regulation',
  guideline: 'Guideline',
};

// ── Policy Database ──────────────────────────────────────────────────────────

const POLICIES: PolicyMemo[] = [
  // ════════════════════════════ COA ════════════════════════════
  {
    id: 'coa-001',
    title: 'COA Circular No. 2012-001: Guidelines on the Grant and Settlement of Compensation and Allowances of Government Employees',
    agency: 'coa',
    topics: ['salary', 'wages', 'benefits'],
    date: '2012-06-15',
    refNumber: 'COA Circular No. 2012-001',
    summary: 'Prescribes the rules governing the grant of compensation, allowances, and other benefits to government employees. Ensures that all compensation-related disbursements are supported by proper documentation and conform to the Compensation and Position Classification System (CPCS).',
    keyProvisions: [
      'All allowances must be authorized by the DBM or under existing laws.',
      'Representation and transportation allowances (RATA) are subject to COA review.',
      'Overpayment of salaries and allowances must be refunded or offset.',
      'Compensation for extra work assignments must have prior approval.',
      'Audit findings on unauthorized compensation shall be disallowed.',
    ],
    effectiveDate: '2012-06-15',
    relevance: 'high',
    category: 'circular',
  },
  {
    id: 'coa-002',
    title: 'COA Memorandum No. 2020-001: Audit of Government Benefits and Allowances During COVID-19',
    agency: 'coa',
    topics: ['benefits', 'govt_benefits', 'compliance'],
    date: '2020-04-20',
    refNumber: 'COA Memo No. 2020-001',
    summary: 'Provides guidance on the audit of special allowances, hazard pay, and other benefits granted to government frontliners during the state of national emergency due to COVID-19.',
    keyProvisions: [
      'Hazard pay of ₱500/day for health workers and frontliners during the emergency period.',
      'Special risk allowance for employees exposed to confirmed COVID-19 cases.',
      'Subistence, accommodation, and transportation allowances for deployed personnel.',
      'All emergency benefits must be supported by actual deployment orders.',
      'Strict documentation required for audit trail purposes.',
    ],
    effectiveDate: '2020-04-20',
    relevance: 'medium',
    category: 'memorandum',
  },
  {
    id: 'coa-003',
    title: 'COA Circular No. 2015-002: Rules and Regulations on the Payment of Salaries, Wages, and Other Emoluments',
    agency: 'coa',
    topics: ['salary', 'wages', 'compliance'],
    date: '2015-03-10',
    refNumber: 'COA Circular No. 2015-002',
    summary: 'Consolidates existing rules on the payment of salaries, wages, and other forms of compensation in government. Establishes controls to prevent overpayment and ghost employees.',
    keyProvisions: [
      'All payroll payments must be supported by approved payrolls and plantilla positions.',
      'Salaries shall only be released upon certification by the authorized officer.',
      'Deductions for GSIS, PhilHealth, Pag-IBIG, and withholding tax must be remitted on time.',
      'No employee shall receive compensation in excess of the approved rate.',
      'Monthly reconciliation of payroll vs. actual headcount is mandatory.',
    ],
    effectiveDate: '2015-03-10',
    relevance: 'high',
    category: 'circular',
  },

  // ════════════════════════════ DBM ════════════════════════════
  {
    id: 'dbm-001',
    title: 'DBM-NBC No. 601: Third Tranche of the SSL for Civilian Government Employees',
    agency: 'dbm',
    topics: ['salary', 'wages'],
    date: '2026-01-01',
    refNumber: 'NBC No. 601',
    summary: 'Implements the third tranche of the Salary Standardization Law (SSL) for civilian government employees under Republic Act No. 11466 as amended by RA 12015. This tranche provides the penultimate salary adjustment before the fourth and final tranche.',
    keyProvisions: [
      'Third tranche salary increases effective January 1, 2026.',
      'Salary Grade 1: ₱14,411; Salary Grade 33: ₱82,819.',
      'Step increment of 3% per year for qualified employees.',
      'Mid-year bonus equivalent to one month basic salary.',
      'Year-end bonus equivalent to one month basic salary plus ₱5,000 cash gift.',
      'Funding sourced from the respective agency\'s Personnel Services allotment.',
      'Honoraria and other allowances remain unchanged.',
    ],
    effectiveDate: '2026-01-01',
    relevance: 'high',
    category: 'resolution',
  },
  {
    id: 'dbm-002',
    title: 'DBM-NBC No. 579: Fourth Tranche of the SSL for Civilian Employees',
    agency: 'dbm',
    topics: ['salary', 'wages'],
    date: '2025-01-01',
    refNumber: 'NBC No. 579',
    summary: 'Implements the fourth (final) tranche of the Salary Standardization Law (SSL) for civilian government employees, completing the four-year salary adjustment cycle under Republic Act No. 11466 as amended by RA 12015.',
    keyProvisions: [
      'Fourth tranche increases range from ₱500 to ₱5,209 depending on salary grade.',
      'Salary Grade 1 increases from ₱14,141 to ₱14,678; Salary Grade 33 from ₱80,478 to ₱85,687.',
      'Honoraria and other allowances remain unchanged.',
      'Funding sourced from the respective agency\'s Personnel Services allotment.',
      'Retroactive to January 1, 2025.',
    ],
    effectiveDate: '2025-01-01',
    relevance: 'high',
    category: 'resolution',
  },
  {
    id: 'dbm-003',
    title: 'DBM-NBC No. 580: Fourth Tranche of the SSL for Uniformed Personnel',
    agency: 'dbm',
    topics: ['salary', 'benefits'],
    date: '2025-01-01',
    refNumber: 'NBC No. 580',
    summary: 'Implements the fourth tranche of the SSL for uniformed personnel of the AFP, PNP, BFP, BJMP, and Bureau of Corrections.',
    keyProvisions: [
      'Salary adjustments parallel to civilian counterpart positions.',
      'Annual Base Pay increases of ₱3,000 to ₱15,000 depending on rank.',
      'No reduction in existing allowances and benefits.',
    ],
    effectiveDate: '2025-01-01',
    relevance: 'high',
    category: 'resolution',
  },
  {
    id: 'dbm-004',
    title: 'DBM-DOF Joint Circular No. 1, s. 2018: Guidelines on the Implementation of the SSL',
    agency: 'dbm',
    topics: ['salary', 'compliance'],
    date: '2018-01-15',
    refNumber: 'DBM-DOF JC No. 1-2018',
    summary: 'Joint guidelines between DBM and DOF on the implementation of Republic Act No. 11466 (Salary Standardization Law of 2015), covering salary rates, allowances, and benefits for government personnel.',
    keyProvisions: [
      'Four-year salary schedule from 2016 to 2019 (extended by RA 12015 to 2025).',
      'Prohibition on grant of additional compensation not authorized by law.',
      'Step increment of 3% per year for qualified employees.',
      'Mid-year bonus equivalent to one month basic salary.',
      'Year-end bonus equivalent to one month basic salary plus ₱5,000 cash gift.',
    ],
    effectiveDate: '2018-01-15',
    relevance: 'high',
    category: 'guideline',
  },
  {
    id: 'dbm-005',
    title: 'DBM Budget Call: Personnel Services Allocation Guidelines FY 2026',
    agency: 'dbm',
    topics: ['salary', 'benefits', 'compliance'],
    date: '2025-07-01',
    refNumber: 'DBM Budget Call FY2026-PS',
    summary: 'Annual budget call prescribing the ceiling and guidelines for Personnel Services appropriations, including salary adjustments, step increments, and fringe benefits for fiscal year 2026.',
    keyProvisions: [
      'PS allocation ceiling based on authorized plantilla positions.',
      'Funding for third tranche SSL (NBC 601) included in national budget.',
      'Agencies must submit updated plantilla for budget validation.',
      'Personnel Benefits Sharing (PBS) computed at 15% of PS for retirees.',
    ],
    relevance: 'medium',
    category: 'guideline',
  },

  // ════════════════════════════ GSIS ════════════════════════════
  {
    id: 'gsis-001',
    title: 'GSIS Circular No. s. 2024-002: Revised Premium Contribution Rates for GSIS Life and Retirement Insurance',
    agency: 'gsis',
    topics: ['premiums', 'retirement', 'govt_benefits'],
    date: '2024-01-01',
    refNumber: 'GSIS Cir. s. 2024-002',
    summary: 'Revised premium contribution rates for GSIS Life and Retirement Insurance effective January 1, 2024. The personal share remains at 9% of basic monthly salary, while the government share is 12% of basic monthly salary.',
    keyProvisions: [
      'Personal share: 9% of basic monthly salary (inclusive of LGU pay).',
      'Government share: 12% of basic monthly salary.',
      'GSIS Ecclesiastical Cost (EC): Fixed ₱100 per month.',
      'Premium is deducted from the first and fifteenth period pays.',
      'Contributions are remitted within 15 days from payroll release.',
    ],
    effectiveDate: '2024-01-01',
    relevance: 'high',
    category: 'circular',
  },
  {
    id: 'gsis-002',
    title: 'GSIS Act of 1997 (RA 8291): Amended Provisions on Retirement Benefits',
    agency: 'gsis',
    topics: ['retirement', 'govt_benefits', 'salary'],
    date: '1997-05-30',
    refNumber: 'RA 8291',
    summary: 'The GSIS Act of 1997 governs the social insurance system for government employees. It provides comprehensive coverage including life insurance, retirement, disability, and separation benefits.',
    keyProvisions: [
      'Minimum 5 years of service and age of 60 for optional retirement.',
      'Compulsory retirement at age 65 with at least 15 years of service.',
      'Retirement pay = 2.5% × average monthly salary × years of service.',
      'Minimum of 22 years service credit for maximum retirement benefit.',
      'Separation pay for involuntary separation: 1 month salary per year of service (max 18 months).',
      'Total Disability Pension: ₱5,185/month (1st to 3rd year), ₱6,481/month thereafter.',
    ],
    effectiveDate: '1997-06-01',
    relevance: 'high',
    category: 'regulation',
  },
  {
    id: 'gsis-003',
    title: 'GSIS Memorandum: Loan Interest Rates and Amortization Schedule',
    agency: 'gsis',
    topics: ['premiums', 'govt_benefits'],
    date: '2023-07-01',
    refNumber: 'GSIS Memo Circular 2023-LOAN',
    summary: 'Updated loan interest rates and amortization schedules for all GSIS loan products including Salary Loan, Emergency Loan, and Conso-Loan.',
    keyProvisions: [
      'Salary Loan: 10% per annum (reducible interest).',
      'Emergency Loan: 6% per annum.',
      'Conso-Loan: 10% per annum, 25-year repayment period.',
      'Home Development Fund (HDF) Loan: 8% per annum.',
      'Overdue payments charged 2% penalty per month on outstanding balance.',
      'Loan amortization deducted from salary at source.',
    ],
    relevance: 'high',
    category: 'memorandum',
  },
  {
    id: 'gsis-004',
    title: 'GSIS Circular: Updated GSIS Premium Rates and Government Share Computation',
    agency: 'gsis',
    topics: ['premiums', 'salary', 'govt_benefits'],
    date: '2024-06-01',
    refNumber: 'GSIS Cir. s. 2024-PREM',
    summary: 'Provides updated computation guide for GSIS premiums covering Life Insurance, Retirement, Medicare, and EC components with government share breakdown.',
    keyProvisions: [
      'Agency share L&R = 12% × basic monthly salary.',
      'Employee share L&R = 9% × basic monthly salary.',
      'Agency Medicare = 2.25% × basic monthly salary (for old rates).',
      'Agency EC = Fixed ₱100/month.',
      'Premium base includes basic salary and permanent additional pay.',
      'GSIS CCIS (Common Collection Information System) used for reporting.',
    ],
    relevance: 'high',
    category: 'circular',
  },

  // ════════════════════════════ Pag-IBIG ════════════════════════════
  {
    id: 'pagibig-001',
    title: 'Pag-IBIG Fund Circular No. 460: Revised Contribution Rates and Membership Guidelines',
    agency: 'pagibig',
    topics: ['premiums', 'govt_benefits', 'salary'],
    date: '2025-01-15',
    refNumber: 'Pag-IBIG Circular No. 460',
    summary: 'Comprehensive revision of Pag-IBIG Fund contribution rates, membership eligibility, and benefit entitlements for government and private sector employees. This circular consolidates all previous amendments and provides the current contribution schedule effective 2025.',
    keyProvisions: [
      'Government employees: Fixed ₱200 monthly contribution (employee share), with matching ₱200 from agency.',
      'Private sector employees earning ≤ ₱5,000/month: Fixed ₱100 employee + ₱100 employer (total ₱200).',
      'Private sector employees earning > ₱5,000/month: 2% employee share + 2% employer share.',
      'Maximum monthly contribution: ₱2,500 (employee + employer combined).',
      'MP2 (Modified Pag-IBIG II) voluntary savings: Minimum ₱500 contribution, dividend rate of 6.0% per annum.',
      'Membership eligibility: Mandatory for all government employees, optional for private sector with ₱5,000+ monthly salary.',
      'Remittance deadline: On or before the 10th day following the applicable payroll period.',
      'Penalty for late remittance: 2% per month on unpaid contributions.',
    ],
    effectiveDate: '2025-01-01',
    relevance: 'high',
    category: 'circular',
  },
  {
    id: 'pagibig-002',
    title: 'Pag-IBIG Fund Circular No. 460: Housing Loan Amortization and Benefits Schedule',
    agency: 'pagibig',
    topics: ['benefits', 'govt_benefits'],
    date: '2025-01-15',
    refNumber: 'Pag-IBIG Circular No. 460-HL',
    summary: 'Updated housing loan interest rates, amortization schedules, and benefits computation under Pag-IBIG Fund Circular No. 460, effective January 2025.',
    keyProvisions: [
      'Regular housing loan interest: 5.50% per annum (1-10 years), 6.50% (11-20 years), 7.00% (21-30 years).',
      'Maximum loanable amount: ₱6,000,000 (increased from ₱5,500,000).',
      'Maximum repayment period: 30 years.',
      'Minimum membership: 24 months Pag-IBIG contribution and 15 contributions within 24 months prior to loan application.',
      'Housing loan interest rate for OFW members: 5.75% per annum.',
      'Short-term multi-purpose loan: 10.5% per annum, maximum ₱40,000.',
      'Calamity loan: 5.75% per annum, maximum ₱100,000.',
      'Final benefits: Annual dividend of 6.0% on total contributions (mandatory savings).',
    ],
    effectiveDate: '2025-01-01',
    relevance: 'high',
    category: 'circular',
  },

  // ════════════════════════════ PhilHealth ════════════════════════════
  {
    id: 'ph-001',
    title: 'PhilHealth Circular No. PH OUF-2024-0392: Revised Contribution Rates for 2024-2025',
    agency: 'philhealth',
    topics: ['premiums', 'govt_benefits'],
    date: '2024-01-01',
    refNumber: 'PH OUF-2024-0392',
    summary: 'Revised PhilHealth contribution rates implementing the graduated premium rate schedule under the Universal Health Care Act (RA 11223). Rates gradually increase over the transition period.',
    keyProvisions: [
      'Contribution rate: 5% of basic monthly salary (2024 rate, increasing to 5% by 2025).',
      'Premium base: Basic monthly salary (no ceiling for 2024, ceiling of ₱100,000 for 2025).',
      'Employee share: 2.25% (for government employees under the old split).',
      'Government share: 2.75% for government employees.',
      'For salaries ₱10,000 and below, contribution is capped.',
      'PhilHealth ID required for all members and dependents.',
    ],
    effectiveDate: '2024-01-01',
    relevance: 'high',
    category: 'circular',
  },
  {
    id: 'ph-002',
    title: 'PhilHealth Circular: Benefits Schedule and Case Rates for Government Employees',
    agency: 'philhealth',
    topics: ['benefits', 'govt_benefits'],
    date: '2024-06-01',
    refNumber: 'PH Cir. Benefits-2024',
    summary: 'Updated benefits schedule and case rates for PhilHealth member and dependent coverage, including inpatient, outpatient, and Z-benefit packages.',
    keyProvisions: [
      'Inpatient coverage: 90% of case rate for semi-private ward.',
      'Outpatient coverage: 80% of net claimed amount, max ₱9,000 per visit.',
      'Z-benefit packages for specific conditions (cancer, dialysis, TB, etc.).',
      'Normal delivery benefit: ₱8,000 (professional fee + facility fee).',
      'Catastrophic illness coverage: 100% for case rates up to ₱1,450,000.',
      'Dependent coverage includes legal spouse and 2 children (age 21 below, unmarried).',
    ],
    relevance: 'high',
    category: 'circular',
  },

  // ════════════════════════════ CSC ════════════════════════════
  {
    id: 'csc-001',
    title: 'CSC Resolution No. 1800405: Updated Leave Rules for Government Employees',
    agency: 'csc',
    topics: ['benefits', 'compliance'],
    date: '2018-05-15',
    refNumber: 'CSC Resolution No. 1800405',
    summary: 'Consolidated rules on the grant and administration of vacation and sick leave for government employees, including the new leave credits under the Expanded Maternity Leave Law (RA 11210).',
    keyProvisions: [
      'Vacation leave: 15 days per year (cumulative, max 150 days).',
      'Sick leave: 15 days per year (cumulative, max 150 days).',
      'Solo parent leave: 15 days per year.',
      'Special leave for women: 60 days (after gynecological surgery).',
      'Maternity leave: 105 days (paid) for all female employees.',
      'Paternity leave: 15 days for married male employees.',
      '10-day leave conversion for Valentine to Heroes\' Day period.',
    ],
    effectiveDate: '2018-05-15',
    relevance: 'high',
    category: 'resolution',
  },
  {
    id: 'csc-002',
    title: 'CSC Memorandum Circular No. 6, s. 2017: National Leadership Training Program (NLTP)',
    agency: 'csc',
    topics: ['benefits', 'compliance'],
    date: '2017-07-01',
    refNumber: 'CSC MC No. 6, s. 2017',
    summary: 'Provides guidelines on the conduct and administration of leadership training programs for government officials and employees.',
    keyProvisions: [
      'Training leave is non-convertible to cash.',
      'Officials attending CSC-approved programs are entitled to training leave.',
      'Per diem and travel expenses covered by agency training budget.',
    ],
    relevance: 'low',
    category: 'memorandum',
  },
  {
    id: 'csc-003',
    title: 'CSC Unified Omnibus Rules on Leave (MC No. 1, s. 2018)',
    agency: 'csc',
    topics: ['benefits', 'compliance'],
    date: '2018-01-06',
    refNumber: 'CSC MC No. 1, s. 2018',
    summary: 'Consolidates all existing leave rules and regulations into one comprehensive document governing vacation, sick, maternity, paternity, solo parent, special, and study leave for government employees.',
    keyProvisions: [
      'Terminal leave: cash equivalent of unused VL and SL at retirement/separation.',
      'Study leave: 6 months maximum for masteral/doctoral programs (with agency approval).',
      'Leave without pay granted for personal reasons (max 6 months).',
      'Leave credits are earned monthly (1.25 VL + 1.25 SL per month).',
      'Reporting of leave credits within 5 days after returning from leave.',
    ],
    effectiveDate: '2018-01-06',
    relevance: 'high',
    category: 'memorandum',
  },

  // ════════════════════════════ DepEd ════════════════════════════
  {
    id: 'deped-001',
    title: 'DepEd Order No. 005, s. 2018: Revised Guidelines on the Release of Teachers\' Basic Salary',
    agency: 'deped',
    topics: ['salary', 'wages', 'compliance'],
    date: '2018-03-01',
    refNumber: 'DO No. 005, s. 2018',
    summary: 'Provides revised guidelines for the timely release of teachers\' salaries, including the processing of payrolls, loan deductions, and mandatory contribution remittances.',
    keyProvisions: [
      'Teachers shall receive their salaries on or before the 15th day of each month.',
      'Payroll processing shall be completed no later than 5 days before the pay date.',
      'Loan deductions (GSIS, Pag-IBIG, SSS, Cooperatives) processed via APDS.',
      'APDS deduction priority: Government-mandated deductions first, then agency-deducted loans.',
      'Undeducted obligations tracked and reported monthly.',
      'Net take-home pay shall not fall below ₱5,000 (NTHP floor rule).',
    ],
    effectiveDate: '2018-03-01',
    relevance: 'high',
    category: 'order',
  },
  {
    id: 'deped-002',
    title: 'DepEd Order No. 022, s. 2020: Guidelines on the Payment of Special Allowance and Benefits for DepEd Personnel',
    agency: 'deped',
    topics: ['benefits', 'salary'],
    date: '2020-07-01',
    refNumber: 'DO No. 022, s. 2020',
    summary: 'Provides guidelines on the grant of special allowance and additional benefits for DepEd teaching and non-teaching personnel, including chalk allowance, internet allowance, and teaching load incentives.',
    keyProvisions: [
      'Chalk allowance: ₱5,000 per school year for public school teachers.',
      'Teaching load allowance for teachers with overload beyond 8 hours.',
      'Remote teaching/internet allowance during distance learning modalities.',
      'Hazard pay for teachers assigned in difficult or dangerous areas.',
      'Special hardship allowance for science/math/scout coordinators.',
    ],
    effectiveDate: '2020-07-01',
    relevance: 'high',
    category: 'order',
  },
  {
    id: 'deped-003',
    title: 'DepEd Memorandum No. 32, s. 2024: Updated Step Increment and Salary Grade Adjustment Procedures',
    agency: 'deped',
    topics: ['salary', 'compliance'],
    date: '2024-04-15',
    refNumber: 'DM No. 32, s. 2024',
    summary: 'Provides updated procedures for processing step increments and salary grade adjustments for DepEd teaching and non-teaching personnel.',
    keyProvisions: [
      'Step increment: 3% increase on basic salary per qualifying year of service.',
      'Step increments are processed annually effective July 1.',
      'Salary grade adjustment upon promotion takes effect the following month.',
      'Employees must have satisfactory performance rating to qualify for step increment.',
      'Processing handled by Division HRMOs through the People Management Information System (PMIS).',
    ],
    effectiveDate: '2024-04-15',
    relevance: 'high',
    category: 'memorandum',
  },
  {
    id: 'deped-004',
    title: 'DepEd Order No. 039, s. 2016: Guidelines on the Utilization and Reporting of MOOE and CO Funds',
    agency: 'deped',
    topics: ['compliance', 'salary'],
    date: '2016-09-01',
    refNumber: 'DO No. 039, s. 2016',
    summary: 'Prescribes guidelines on the utilization and financial reporting of Maintenance and Other Operating Expenses (MOOE) and Capital Outlay (CO) funds, including allowances chargeable to these accounts.',
    keyProvisions: [
      'Allowances not authorized by DBM shall not be charged to MOOE.',
      'Personnel Benefits Sharing (PBS) computed at 15% of PS.',
      'All expenditures subject to COA pre-audit requirements.',
      'Monthly utilization reports submitted to Finance Division.',
    ],
    relevance: 'medium',
    category: 'order',
  },

  // ════════════════════════════ BIR ════════════════════════════
  {
    id: 'bir-001',
    title: 'BIR Revenue Regulations No. 11-2018: Withholding Tax on Compensation (TRAIN Law)',
    agency: 'bir',
    topics: ['taxation', 'salary', 'compliance'],
    date: '2018-01-01',
    refNumber: 'RR No. 11-2018',
    summary: 'Implements the withholding tax on compensation under the Tax Reform for Acceleration and Inclusion (TRAIN) Law (RA 10963). Replaces the personal and additional exemptions with a ₱250,000 annual tax-exempt threshold.',
    keyProvisions: [
      'Annual taxable income up to ₱250,000: EXEMPT from withholding tax.',
      '₱250,001 – ₱400,000: 15% of excess over ₱250,000.',
      '₱400,001 – ₱800,000: ₱22,500 + 20% of excess over ₱400,000.',
      '₱800,001 – ₱2,000,000: ₱102,500 + 25% of excess over ₱800,000.',
      '₱2,000,001 – ₱8,000,000: ₱402,500 + 30% of excess over ₱2,000,000.',
      'Above ₱8,000,000: ₱2,202,500 + 35% of excess over ₱8,000,000.',
      'Employer uses annualized income method for monthly withholding tax computation.',
      '13th month pay and other benefits exempt up to ₱90,000.',
    ],
    effectiveDate: '2018-01-01',
    relevance: 'high',
    category: 'regulation',
  },
  {
    id: 'bir-002',
    title: 'BIR Revenue Regulations No. 10-2008: Taxability of Employee Benefits and 13th Month Pay',
    agency: 'bir',
    topics: ['taxation', 'benefits', 'salary'],
    date: '2008-06-01',
    refNumber: 'RR No. 10-2008',
    summary: 'Provides comprehensive rules on the tax treatment of employee benefits, 13th month pay, Christmas bonuses, and other fringe benefits.',
    keyProvisions: [
      '13th month pay is tax-exempt (P.D. 851 as amended by R.A. 7166).',
      'Other benefits (Christmas bonus, productivity bonus, etc.) exempt up to ₱90,000 (TRAIN Law).',
      'De minimis benefits (rice subsidy, uniform allowance, medical benefits) are non-taxable.',
      'Fringe benefit tax (FBT) applies to privileges granted to managerial employees at 35% of the monetary equivalent.',
      'Employer\'s Fringe Benefit Tax is separate from employee\'s withholding tax on compensation.',
    ],
    effectiveDate: '2008-06-01',
    relevance: 'high',
    category: 'regulation',
  },
  {
    id: 'bir-003',
    title: 'BIR Revenue Regulation No. 2-1998: Withholding Tax on Compensation Income',
    agency: 'bir',
    topics: ['taxation', 'compliance'],
    date: '1998-01-01',
    refNumber: 'RR No. 2-1998',
    summary: 'Original implementing rules for withholding tax on compensation income of employees in the private and public sectors. Substantially amended by the TRAIN Law (RR 11-2018).',
    keyProvisions: [
      'Employers required to withhold tax on compensation income.',
      'Monthly withholding tax tables prescribed by BIR.',
      'Annual Information Return (BIR Form 1604-C) filed annually.',
      'Employer must issue BIR Form 2316 (Alphalist) to employees.',
      'Penalties for non-remittance: 25% surcharge + 12% interest per annum.',
    ],
    relevance: 'medium',
    category: 'regulation',
  },
  {
    id: 'bir-004',
    title: 'BIR Revenue Memorandum Order No. 23-2024: Annual Filing Requirements for Government Agencies',
    agency: 'bir',
    topics: ['taxation', 'compliance'],
    date: '2024-02-15',
    refNumber: 'RMO No. 23-2024',
    summary: 'Consolidates the annual filing requirements for government agencies including withholding tax returns (BIR Forms 1604-C, 1604-E, 2316), alphanumeric tax codes, and deadlines.',
    keyProvisions: [
      'BIR Form 1604-C (Annual Information Return of Income Taxes Withheld) due January 31.',
      'BIR Form 2316 (Certificate of Compensation Payment) issued to each employee by January 31.',
      'Monthly remittance of withholding tax via BIR Form 0605 due on the 10th of the following month.',
      'Government agencies are quasi-withholding agents for their employees.',
      'Amended returns must indicate "Amended" and reference the original filing.',
    ],
    effectiveDate: '2024-02-15',
    relevance: 'high',
    category: 'order',
  },
  {
    id: 'bir-005',
    title: 'BIR Revenue Memorandum Circular No. 107-2024: Updated Withholding Tax Rates on Compensation',
    agency: 'bir',
    topics: ['taxation', 'salary', 'compliance'],
    date: '2024-09-15',
    refNumber: 'RMC No. 107-2024',
    summary: 'Provides updated guidance on the withholding tax rates and computation methods for compensation income, including the revised tax tables and exemptions under the CREATE Law amendments to the TRAIN Law.',
    keyProvisions: [
      'Revised monthly withholding tax table effective October 1, 2024.',
      'De minimis benefits threshold increased to ₱130,000 annually for non-taxable fringe benefits.',
      '13th month pay and other benefits exempt up to ₱100,000 (increased from ₱90,000).',
      'Government employees: withholding tax computed using the annualized income method.',
      'Employer must file BIR Form 1604-C annually by January 31 of the following year.',
      'Penalties for non-compliance: 25% surcharge + 12% interest per annum on unpaid taxes.',
    ],
    effectiveDate: '2024-10-01',
    relevance: 'high',
    category: 'memorandum',
  },
  {
    id: 'bir-006',
    title: 'BIR Revenue Regulations No. 29-2025: Revised Withholding Tax on Compensation and Fringe Benefits',
    agency: 'bir',
    topics: ['taxation', 'salary', 'benefits'],
    date: '2025-07-01',
    refNumber: 'RR No. 29-2025',
    summary: 'Comprehensive revision of the withholding tax rules on compensation income and fringe benefits, consolidating all amendments under the TRAIN Law, CREATE Act, and subsequent BIR issuances. This regulation replaces RR 11-2018 and other related circulars.',
    keyProvisions: [
      'Updated annual taxable income brackets: ₱250,000 exempt threshold retained.',
      '₱250,001 – ₱450,000: 15% of excess over ₱250,000 (expanded bracket).',
      '₱450,001 – ₱900,000: ₱30,000 + 20% of excess over ₱450,000.',
      '₱900,001 – ₱2,500,000: ₱120,000 + 25% of excess over ₱900,000.',
      '₱2,500,001 – ₱8,000,000: ₱520,000 + 30% of excess over ₱2,500,000.',
      'Above ₱8,000,000: ₱2,170,000 + 35% of excess over ₱8,000,000.',
      'Fringe benefit tax (FBT) rate: 35% of the monetary equivalent of the privilege.',
      'Employers must adjust withholding tax when employee changes pay period (monthly to semi-monthly).',
      'BIR Form 2316 must be signed by both employer and employee; unsigned forms are deemed unaudited.',
    ],
    effectiveDate: '2025-07-01',
    relevance: 'high',
    category: 'regulation',
  },
  {
    id: 'bir-007',
    title: 'BIR Revenue Memorandum Circular No. 107-2024: Annual Information Return Filing Guidelines',
    agency: 'bir',
    topics: ['taxation', 'compliance'],
    date: '2024-09-15',
    refNumber: 'RMC No. 107-2024-AR',
    summary: 'Detailed guidelines on the preparation and filing of the Annual Information Return of Income Taxes Withheld on Compensation (BIR Form 1604-C) and Certificate of Compensation Payment (BIR Form 2316) for calendar year 2024.',
    keyProvisions: [
      'BIR Form 1604-C due date: January 31, 2025.',
      'BIR Form 2316 must be issued to each employee on or before January 31, 2025.',
      'Electronic filing via BIR eFPS is mandatory for large employers (≥50 employees).',
      'Alphabetical listing of employees with gross compensation, tax withheld, and exemptions.',
      'Amended returns allowed within 3 years from original filing date.',
      'Penalty for late filing: ₱1,000 per return or 25% of tax due, whichever is higher.',
    ],
    effectiveDate: '2024-09-15',
    relevance: 'high',
    category: 'memorandum',
  },
  {
    id: 'bir-008',
    title: 'Revenue Memorandum No. 2024-112: Order of Priority in the Deduction of Government Employees\'s Salary for Loan Payments and Other Obligations',
    agency: 'bir',
    topics: ['salary', 'taxation', 'compliance'],
    date: '2024-11-15',
    refNumber: 'RM No. 2024-112',
    summary: 'Prescribes the order of priority in the deduction of salaries of government employees for loan payments and other obligations, ensuring compliance with existing laws and regulations on salary deductions. This memorandum establishes the sequential order in which deductions shall be applied against an employee\'s gross salary, with mandatory contributions taking precedence over voluntary loan deductions.',
    keyProvisions: [
      'FIRST PRIORITY: GSIS Life & Retirement Insurance (9% employee share, 12% government share).',
      'SECOND PRIORITY: PhilHealth National Health Insurance (2.5% employee share, 2.5% government share).',
      'THIRD PRIORITY: Pag-IBIG Fund Housing Mutual Fund (fixed P200 employee, P200 government).',
      'FOURTH PRIORITY: BIR Withholding Tax (based on TRAIN Law graduated rates).',
      'FIFTH PRIORITY: Loan deductions in order — (a) BIR loans, (b) GSIS loans (salary, emergency, policy), (c) PhilHealth loans, (d) Pag-IBIG loans (multi-purpose, housing), (e) Cooperative loans, (f) MBA loans, (g) Provident/Savings, (h) Insurance.',
      'LEAST PRIORITY: EXCLUDED deductions from the EXCLUDED.DBF file — these are deducted last and only if NTHP (Net Take Home Pay) capacity remains after all higher-priority deductions. If capacity is insufficient, they become Undeducted Obligations.',
      'NTHP THRESHOLD: Net Take Home Pay must not fall below P5,000.00 (DepEd requirement). Any deduction that would cause NTHP to fall below this threshold is reversed and moved to Undeducted Obligations.',
      'INCLUDED deductions from the INCLUDED.DBF file take precedence over normal DEDFILE deductions and are always processed first.',
    ],
    effectiveDate: '2024-11-15',
    relevance: 'high',
    category: 'memorandum',
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function PolicyLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgency, setSelectedAgency] = useState<AgencyId | 'all'>('all');
  const [selectedTopic, setSelectedTopic] = useState<TopicId | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filtered = useMemo(() => {
    let result = [...POLICIES];
    if (selectedAgency !== 'all') result = result.filter((p) => p.agency === selectedAgency);
    if (selectedTopic !== 'all') result = result.filter((p) => p.topics.includes(selectedTopic));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.refNumber.toLowerCase().includes(q) ||
          p.keyProvisions.some((kp) => kp.toLowerCase().includes(q)),
      );
    }
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [searchQuery, selectedAgency, selectedTopic]);

  const agencyStats = useMemo(() => {
    const stats: Record<string, number> = {};
    POLICIES.forEach((p) => { stats[p.agency] = (stats[p.agency] || 0) + 1; });
    return stats;
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-deped-500 to-deped-700 flex items-center justify-center shadow-lg shadow-deped-500/20">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Policy &amp; Regulation Library</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Official memos, circulars, and guidelines from government agencies
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
            {filtered.length} document{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {(Object.keys(AGENCIES) as AgencyId[]).map((aid) => {
          const ag = AGENCIES[aid];
          const Icon = ag.icon;
          const count = agencyStats[aid] || 0;
          const isActive = selectedAgency === aid;
          return (
            <button
              key={aid}
              onClick={() => setSelectedAgency(isActive ? 'all' : aid)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                isActive
                  ? `${ag.bgColor} ring-2 ring-offset-1 ring-current`
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? ag.color : 'text-slate-400'}`} />
              <span className={`text-lg font-bold ${isActive ? ag.color : 'text-slate-700 dark:text-slate-200'}`}>{count}</span>
              <span className="text-[10px] font-medium text-slate-400 text-center leading-tight">{aid.toUpperCase()}</span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 px-5 py-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search policies, circulars, memos…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-sm focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-400 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value as TopicId | 'all')}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-deped-500/30 cursor-pointer"
            >
              <option value="all">All Topics</option>
              {(Object.keys(TOPICS) as TopicId[]).map((tid) => (
                <option key={tid} value={tid}>{TOPICS[tid].label}</option>
              ))}
            </select>
            <select
              value={selectedAgency}
              onChange={(e) => setSelectedAgency(e.target.value as AgencyId | 'all')}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-deped-500/30 cursor-pointer"
            >
              <option value="all">All Agencies</option>
              {(Object.keys(AGENCIES) as AgencyId[]).map((aid) => (
                <option key={aid} value={aid}>{AGENCIES[aid].label}</option>
              ))}
            </select>
            <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-deped-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50'}`}
              >Grid</button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-deped-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50'}`}
              >List</button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No policies match your search criteria.</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedAgency('all'); setSelectedTopic('all'); }}
            className="mt-3 text-sm text-deped-600 hover:text-deped-700 font-medium"
          >Clear filters</button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} expanded={expandedId === policy.id} onToggle={() => setExpandedId(expandedId === policy.id ? null : policy.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((policy) => (
            <PolicyListItem key={policy.id} policy={policy} expanded={expandedId === policy.id} onToggle={() => setExpandedId(expandedId === policy.id ? null : policy.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PolicyCard({ policy, expanded, onToggle }: { policy: PolicyMemo; expanded: boolean; onToggle: () => void }) {
  const ag = AGENCIES[policy.agency];
  const Icon = ag.icon;

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all hover:shadow-md ${expanded ? 'border-deped-300 dark:border-deped-600 shadow-md' : 'border-slate-200/80 dark:border-slate-700/80 shadow-sm'}`}>
      <button onClick={onToggle} className="w-full text-left p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl ${ag.bgColor} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${ag.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${ag.color}`}>{policy.agency.toUpperCase()}</span>
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{CATEGORY_LABELS[policy.category]}</span>
              {policy.relevance === 'high' && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">KEY</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">{policy.title}</h3>
            <div className="flex items-center gap-2 mt-1.5">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-400">{policy.date}</span>
              <span className="text-[10px] text-slate-300">•</span>
              <span className="text-xs text-slate-400 font-mono">{policy.refNumber}</span>
            </div>
          </div>
          <div className="shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 animate-fade-in">
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{policy.summary}</p>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Key Provisions</h4>
            <ul className="space-y-1.5">
              {policy.keyProvisions.map((kp, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-deped-400 mt-1.5 shrink-0" />
                  {kp}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {policy.topics.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <Tag className="w-3 h-3" />{TOPICS[t].label}
              </span>
            ))}
          </div>
          {policy.effectiveDate && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-3 h-3" />
              Effective: {policy.effectiveDate}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PolicyListItem({ policy, expanded, onToggle }: { policy: PolicyMemo; expanded: boolean; onToggle: () => void }) {
  const ag = AGENCIES[policy.agency];
  const Icon = ag.icon;

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border transition-all ${expanded ? 'border-deped-300 dark:border-deped-600 shadow-md' : 'border-slate-200/80 dark:border-slate-700/80 shadow-sm hover:shadow-md'}`}>
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-center gap-4">
        <div className={`w-9 h-9 rounded-lg ${ag.bgColor} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4.5 h-4.5 ${ag.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${ag.color}`}>{policy.agency.toUpperCase()}</span>
            <span className="text-[10px] font-medium text-slate-400">{CATEGORY_LABELS[policy.category]}</span>
            {policy.relevance === 'high' && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">KEY</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{policy.title}</h3>
        </div>
        <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{policy.date}</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-5 pb-5 space-y-3 animate-fade-in border-t border-slate-100 dark:border-slate-800 pt-3 ml-13">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{policy.summary}</p>
          <ul className="space-y-1">
            {policy.keyProvisions.map((kp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-deped-400 mt-1.5 shrink-0" />{kp}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {policy.topics.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <Tag className="w-3 h-3" />{TOPICS[t].label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

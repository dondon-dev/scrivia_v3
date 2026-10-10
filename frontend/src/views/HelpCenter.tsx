import { useState } from 'react';
import {
  BookOpen, FileText, HelpCircle, Mail, ChevronDown,
  Database, Calculator, Users, Upload, CheckCircle2, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

export type HelpTab = 'guide' | 'docs' | 'faqs' | 'contact';

const TABS: { id: HelpTab; label: string; icon: LucideIcon }[] = [
  { id: 'guide', label: 'User Guide', icon: BookOpen },
  { id: 'docs', label: 'Documentation', icon: FileText },
  { id: 'faqs', label: 'FAQs', icon: HelpCircle },
  { id: 'contact', label: 'Contact Support', icon: Mail },
];

const GUIDE_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Database,
    title: '1. Import your databases',
    body: 'Use Smart Import (Payroll → Smart Import) to upload your DBF files — DEDFILE.DBF, MASTFILE.DBF, PYENT*.DBF and STNTABLE.DBF. Each file is auto-synced into the module it belongs to (deductions, employee masterfile, payent, school directory) and scoped by REGCODE/DIVCODE so every user only sees what their role grants.',
  },
  {
    icon: Users,
    title: '2. Set up employees & organization',
    body: 'Employee Records mirrors the masterfile after import. Use Plantilla Intelligence Center for plantilla positions, Position Management for position codes, and Organization for regions, divisions and the school directory.',
  },
  {
    icon: Calculator,
    title: '3. Run payroll',
    body: 'Open Regular Payroll, pick the open pay period, and run computation. The engine computes net pay for every scoped employee in seconds. Review computed entries, then post the period by division — posting one division never touches another.',
  },
  {
    icon: CheckCircle2,
    title: '4. Post, report & release',
    body: 'After posting, generate reports from the SCRIVIA Report Center (payroll register, GSIS/PhilHealth/Pag-IBIG, BIR, loans, NTHP compliance) and export PYENT files for bank crediting from the DBF Export Center.',
  },
];

const DOCS: { icon: LucideIcon; title: string; body: string; module: string }[] = [
  { icon: Database, title: 'Smart Sync', body: 'Uploaded DBF files are automatically forwarded: DEDFILE.DBF → Master deductions list, INCLUDED.DBF → Deductions that ARE deducted this period, EXCLUDED.DBF → Undeducted obligations (lowest priority, re-deducted first in later periods), MASTFILE.DBF → Employee Masterfile, STNTABLE.DBF → School Directory (all stations, Elementary and High School).', module: 'Payroll' },
  { icon: Calculator, title: 'Payroll Engine', body: 'The fast division-scoped engine computes gross, mandatory deductions, loan deductions and net pay per period. Posting is per division so other divisions are never affected. Posted periods cannot be overwritten — reverse first.', module: 'Payroll' },
  { icon: Users, title: 'Roles & Permissions', body: 'Every screen is permission-gated. A payroll admin sees only the divisions granted to them (by REGCODE/DIVCODE). Super admins manage users, roles and the permission matrix in User Management.', module: 'Administration' },
  { icon: ShieldCheck, title: 'Audit & Security', body: 'All actions are recorded in the Audit Trail. The emergency lockdown button in the header blocks all uploads, imports and syncs until unlocked with the master key.', module: 'Administration' },
  { icon: Upload, title: 'DBF Import / Export', body: 'The DBF Import Center restores legacy files with full validation and a dry-run preview; the Export Center generates DBF/CSV/Excel outputs including PYENT bank files.', module: 'Payroll' },
];

const FAQS: { q: string; a: string }[] = [
  { q: "Why don't I see all employee records after uploading the masterfile?", a: "Records are synced according to your granted scope (REGCODE/DIVCODE). If you manage a specific division, you see that division's employees only. A super admin or your administrator can widen your scope in User Management." },
  { q: 'Payroll posting failed with "Cannot overwrite posted entries" — what now?', a: 'That period already has posted payroll. Reverse the posted pay period for that division in the Payroll page first, then run the payroll again. Posting is per division, so other divisions are unaffected.' },
  { q: 'How are excluded deductions handled?', a: 'EXCLUDED.DBF records are classified as undeducted: they appear as the last entries in the deduction line and are not taken from net pay. INCLUDED.DBF records are deducted, processed first-in-first-serve by deduction rule.' },
  { q: 'What are EXCLUDED and INCLUDED?', a: 'EXCLUDED.DBF and INCLUDED.DBF are breakdowns of DEDFILE. INCLUDED contains deductions that ARE deducted this period. EXCLUDED contains deductions that are NOT deducted — these become undeducted obligations with the lowest priority and are re-deducted first in later periods (FIFO).' },
  { q: 'The dashboard is showing overall totals instead of my division — why?', a: 'A division scope must be selected for division-level stats. Use the Region/Division selector in the sidebar; the dashboard engine then computes live stats scoped to your selection.' },
  { q: 'How do I add users and grant access?', a: 'Administration → User Management (super admin). Approve pending registrations, assign roles, and edit the permission matrix. Changes apply to the menu and screens in real time.' },
];

export default function HelpCenter({ initialTab = 'guide' }: { initialTab?: HelpTab }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<HelpTab>(initialTab);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Help & Support</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Guides, documentation and answers for SCRIVIA Cloud.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-deped-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'guide' && (
        <div className="grid md:grid-cols-2 gap-3">
          {GUIDE_STEPS.map((s) => (
            <div key={s.title} className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <s.icon className="w-6 h-6 text-deped-500 mb-3" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{s.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'docs' && (
        <div className="space-y-3">
          {DOCS.map((d) => (
            <div key={d.title} className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <d.icon className="w-5 h-5 text-deped-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{d.title}</h3>
                <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium text-deped-700 dark:text-deped-300 bg-deped-50 dark:bg-deped-900/40">
                  {d.module}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{d.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'faqs' && (
        <div className="space-y-2">
          {FAQS.map((f, i) => (
            <div key={i} className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <HelpCircle className="w-4 h-4 text-deped-500 shrink-0" />
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{f.q}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <p className="px-4 pb-4 pl-11 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'contact' && (
        <div className="max-w-xl">
          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-deped-50 dark:bg-deped-900/40 flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-deped-600 dark:text-deped-400" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Contact Support</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              If you need help with SCRIVIA Cloud — importing databases, payroll runs, reports or account access — reach out through your system administrator, or email support with the details below.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-slate-600 dark:text-slate-300">
                <span className="text-slate-400">Account:</span>{' '}
                {profile ? `${profile.first_name} ${profile.last_name} (${profile.email})` : '—'}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                <span className="text-slate-400">Role:</span>{' '}
                {profile ? profile.role.replace(/_/g, ' ') : '—'}
              </p>
            </div>
            <a
              href={`mailto:support@scriviacloud.com?subject=SCRIVIA%20Cloud%20Support%20Request&body=${encodeURIComponent(`Account: ${profile?.email ?? ''}\n\nDescribe your issue:`)}`}
              className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 rounded-lg bg-deped-700 text-white text-sm font-semibold hover:bg-deped-800 transition-colors"
            >
              <Mail className="w-4 h-4" /> Email Support
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

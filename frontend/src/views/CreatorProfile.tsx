import {
  Code2, Database, ShieldCheck, Wallet, FileSpreadsheet, Landmark,
  Users, BarChart3, Server, Layers, Sparkles, Award, Github, Linkedin,
  Mail, Phone, MapPin, GraduationCap, Briefcase, Cpu, Lock, CheckCircle2,
} from 'lucide-react';

const SPECIALIZATIONS = [
  { icon: Wallet, label: 'Payroll Systems', desc: 'End-to-end payroll computation, processing, and disbursement workflows.' },
  { icon: FileSpreadsheet, label: 'Accounting Systems', desc: 'Financial ledger management, journal entries, and trial balance automation.' },
  { icon: Landmark, label: 'GSIS Deduction Processing', desc: 'Government Service Insurance System deduction parsing, validation, and remittance.' },
  { icon: Users, label: 'HRIS', desc: 'Human Resource Information Systems with employee masterfile and records management.' },
  { icon: Database, label: 'Database Management', desc: 'Relational database design, optimization, and data integrity enforcement.' },
  { icon: BarChart3, label: 'Financial Reporting', desc: 'Automated report generation with Excel/PDF export and audit trail support.' },
  { icon: Server, label: 'Government Information Systems', desc: 'Compliant systems aligned with Philippine government data standards.' },
  { icon: Cpu, label: 'System Architecture', desc: 'Scalable full-stack architecture with secure role-based access control.' },
];

const CAPABILITIES = [
  'Modern Dashboard Interface',
  'Responsive Design',
  'Secure Authentication',
  'Advanced Reporting',
  'Searchable Data Tables',
  'Server-Side Pagination',
  'Export to Excel / PDF',
  'Audit Logs',
  'Role-Based Access Control',
  'Mobile-Friendly Layouts',
  'Database Optimization',
  'Enterprise UX Standards',
];

const TECH_STACK = [
  { label: 'Frontend', items: ['React', 'TypeScript', 'Tailwind CSS', 'Vite'] },
  { label: 'Backend', items: ['Supabase', 'PostgreSQL', 'Edge Functions', 'Row-Level Security'] },
  { label: 'Data', items: ['DBF Parsing', 'GSIS / PLI Processing', 'Salary Schedules', 'Audit Trails'] },
];

export default function CreatorProfile() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-100">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-4 lg:px-8 pt-12 pb-16">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
            {/* Avatar */}
            <div className="shrink-0">
              <div className="w-36 h-36 lg:w-44 lg:h-44 rounded-3xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur ring-2 ring-white/25 flex items-center justify-center text-5xl lg:text-6xl font-bold shadow-2xl">
                A
              </div>
            </div>

            {/* Identity */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 text-xs font-medium text-brand-100 mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                System Architect &amp; Project Owner
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Adonai A. Magno</h1>
              <p className="text-lg text-brand-100 mt-2 font-medium">Full-Stack Website Designer &amp; Developer</p>

              <div className="flex flex-wrap justify-center lg:justify-start gap-2 mt-5">
                <Pill icon={Briefcase} text="Payroll &amp; Accounting Systems" />
                <Pill icon={ShieldCheck} text="Secure by Design" />
                <Pill icon={Award} text="Enterprise-Grade" />
              </div>

              <div className="flex flex-wrap justify-center lg:justify-start gap-3 mt-6">
                <ContactChip icon={Mail} text="Contact Developer" />
                <ContactChip icon={Github} text="GitHub" />
                <ContactChip icon={Linkedin} text="LinkedIn" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 lg:px-8 -mt-8 pb-12 space-y-8">
        {/* About */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 lg:p-8 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Code2 className="w-5 h-5 text-brand-600" />
            <h2 className="text-xl font-bold text-slate-900">About the Creator</h2>
          </div>
          <p className="text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">Adonai Magno</span> is an Administrative Officer II assigned at the Schools Division Office (SDO) of Calamba City. Passionate about technology and digital transformation, he serves as the developer of Scrivia Cloud, a modern cloud-based information management system designed to streamline administrative processes, improve efficiency, and support data-driven decision-making.
          </p>
          <p className="text-slate-600 leading-relaxed mt-4">
            As a Full-Stack Developer, Adonai specializes in designing and developing end-to-end web applications, covering both frontend and backend technologies. His expertise includes database management, system architecture, user interface development, cloud solutions, and business process automation.
          </p>
          <p className="text-slate-600 leading-relaxed mt-4">
            Through Scrivia Cloud and other digital initiatives, he continues to contribute to the modernization of educational and administrative services by creating innovative, reliable, and user-friendly software solutions that address real-world operational challenges.
          </p>
          <div className="mt-6 p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
            <p className="text-sm font-medium text-slate-700">
              <span className="text-slate-500">Position:</span> Administrative Officer II<br/>
              <span className="text-slate-500">Organization:</span> Schools Division Office of Calamba City<br/>
              <span className="text-slate-500">Role:</span> Full-Stack Developer & Creator of Scrivia Cloud<br/>
              <span className="text-slate-500">Mission:</span> To leverage technology in delivering efficient, innovative, and sustainable digital solutions for education and public service.
            </p>
          </div>
          <p className="text-slate-500 italic text-sm mt-4 text-center">
            "Transforming ideas into digital solutions that empower organizations and improve service delivery."
          </p>
        </section>

        {/* Specializations */}
        <section className="animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-brand-600" />
            <h2 className="text-xl font-bold text-slate-900">Areas of Specialization</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {SPECIALIZATIONS.map((s) => (
              <div
                key={s.label}
                className="group bg-white rounded-xl border border-slate-200 shadow-card p-5 hover:shadow-card-hover hover:border-brand-200 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-[15px]">{s.label}</h3>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Capabilities + Tech */}
        <section className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-brand-600" />
              <h2 className="text-lg font-bold text-slate-900">Platform Capabilities</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2.5">
              {CAPABILITIES.map((c) => (
                <div key={c} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-sm text-slate-700">{c}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-brand-600" />
              <h2 className="text-lg font-bold text-slate-900">Technology Stack</h2>
            </div>
            <div className="space-y-4">
              {TECH_STACK.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <span
                        key={item}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium border border-slate-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Copyright Notice */}
        <section className="bg-gradient-to-br from-brand-900 to-brand-950 rounded-2xl text-white p-6 lg:p-8 shadow-premium animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-brand-200" />
            <h2 className="text-xl font-bold">Copyright &amp; Proprietary Notice</h2>
          </div>
          <p className="text-brand-100 leading-relaxed text-sm lg:text-base">
            &copy; 2026 Adonai A. Magno. All Rights Reserved. No part of this website, including its
            design, functionality, source code, graphics, reports, forms, databases, documents, or
            content structure, may be copied, reproduced, modified, distributed, republished,
            transmitted, or used in any form without prior written permission from the creator.
          </p>
        </section>
      </div>
    </div>
  );
}

function Pill({ icon: Icon, text }: { icon: typeof Code2; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 text-xs font-medium text-white">
      <Icon className="w-3.5 h-3.5" />
      <span dangerouslySetInnerHTML={{ __html: text }} />
    </span>
  );
}

function ContactChip({ icon: Icon, text }: { icon: typeof Code2; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur ring-1 ring-white/20 text-sm font-medium text-white hover:bg-white/15 transition-colors cursor-default">
      <Icon className="w-4 h-4" />
      {text}
    </span>
  );
}

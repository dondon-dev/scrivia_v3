import { useState } from 'react';
import { Database, Download, type LucideIcon } from 'lucide-react';
import SmartImport from '@/views/SmartImport';
import BackupRestore from '@/views/BackupRestore';

type ImportTab = 'smartimport' | 'backup';

interface TabDef {
  key: ImportTab;
  label: string;
  icon: LucideIcon;
  description: string;
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  {
    key: 'smartimport',
    label: 'Smart Import',
    icon: Database,
    description: 'Upload DBF files (MASTFILE, DEDFILE, DIVTABLE, STNTABLE, PAYROLLS, PYENT) — auto-synced into the payroll system',
    component: () => <SmartImport />,
  },
  {
    key: 'backup',
    label: 'Export & Backup',
    icon: Download,
    description: 'Export employee masterfile, deductions, and payroll data as DBF/CSV',
    component: BackupRestore,
  },
];

export default function ImportBackup() {
  const [activeTab, setActiveTab] = useState<ImportTab>('smartimport');

  const current = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const Component = current.component;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center">
            <Database className="w-5 h-5" />
          </span>
          Import and Backup
        </h1>
        <p className="text-sm text-slate-500 mt-1.5 ml-13">
          Sync DBF files into the payroll system, restore legacy data, or export backups
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 bg-slate-100 rounded-xl p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <Component />
    </div>
  );
}

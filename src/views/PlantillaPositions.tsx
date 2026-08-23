import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Briefcase, Search, Upload, FileDown, Printer, Plus, Pencil, Trash2, X,
  UserCheck, UserX, GraduationCap, Building2, Award, DollarSign, Eye,
  FileUp, CheckCircle2, AlertTriangle, ShieldCheck, BarChart3,
  PieChart as PieIcon, School, FileText, Check, Filter, RotateCcw,
  SlidersHorizontal, Layers, Lock, ShieldAlert, Clock, Calendar,
  TrendingUp, Users, ArrowUpRight, ArrowDownRight, Download, FileSpreadsheet,
  ChevronDown, ChevronUp, Columns3, Copy, CopyCheck, UserPlus, UserMinus, ClipboardList,
  XCircle,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import {
  loadPlantillaPositions, savePlantillaPositions, deletePlantillaPosition,
  bulkDeletePlantillaPositions, deleteAllPlantillaPositions, deduplicatePositions,
  loadImportLogs, saveImportLog,
  classifyPersonnelCategory,
  type PlantillaPosition, type PersonnelCategory, type PositionStatus,
  type SchoolType, type PSIPOPAuditLog, type PlantillaHeader,
  INITIAL_AUDIT_LOGS, INITIAL_HEADERS,
} from '@/lib/plantilla';
import { extractAndParseFile, parsePSIPOPText, type ExtractedPSIPOPResult } from '@/lib/psipopEngine';
import LoadingIndicator from '@/components/LoadingIndicator';
import { isImageFile, isPdfFile, isOcrSupportedFile, type OcrProgressInfo, type OcrErrorCategory } from '@/lib/ocrEngine';
import { exportPSIPOPToExcel } from '@/lib/psipopExport';
import { usePagination, Pagination } from '@/components/Pagination';
import { useAuth } from '@/lib/auth';
import { downloadFile, generateCsv } from '@/lib/reports';

type ViewTab = 'dashboard' | 'positions' | 'import' | 'fiscal_year' | 'reports' | 'schools' | 'audit';
type SortDir = 'asc' | 'desc';
type SchoolSubTab = 'elementary' | 'highschool' | 'units' | 'division';

// ── Column definitions for the data grid ────────────────────────────────────
interface ColumnDef {
  key: keyof PlantillaPosition;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
  width?: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'item_number', label: 'Item Number', sortable: true, defaultVisible: true },
  { key: 'employee_name', label: 'Employee Name', sortable: true, defaultVisible: true },
  { key: 'position_title', label: 'Position Title', sortable: true, defaultVisible: true },
  { key: 'salary_grade', label: 'Salary Grade', sortable: true, defaultVisible: true },
  { key: 'authorized_salary', label: 'Authorized Salary', sortable: true, defaultVisible: true },
  { key: 'actual_salary', label: 'Actual Salary', sortable: true, defaultVisible: true },
  { key: 'salary_step', label: 'Step', sortable: true, defaultVisible: false },
  { key: 'education', label: 'Education', sortable: false, defaultVisible: false },
  { key: 'appointment_type', label: 'Appointment Type', sortable: true, defaultVisible: false },
  { key: 'level', label: 'Level', sortable: true, defaultVisible: false },
  { key: 'ppa_attribution', label: 'PPA Attribution', sortable: false, defaultVisible: false },
  { key: 'sex', label: 'Sex', sortable: true, defaultVisible: false },
  { key: 'birth_date', label: 'Birth Date', sortable: true, defaultVisible: false },
  { key: 'tin', label: 'TIN', sortable: false, defaultVisible: false },
  { key: 'appointment_date', label: 'Original Appointment', sortable: true, defaultVisible: false },
  { key: 'last_promotion_date', label: 'Last Promotion', sortable: true, defaultVisible: false },
  { key: 'eligibility', label: 'Eligibility', sortable: false, defaultVisible: false },
  { key: 'position_status', label: 'Status', sortable: true, defaultVisible: true },
];

export default function PlantillaPositions() {
  const { profile, logAudit } = useAuth();
  const [positions, setPositions] = useState<PlantillaPosition[]>([]);
  const [headers, setHeaders] = useState<PlantillaHeader[]>(INITIAL_HEADERS);
  const [auditLogs, setAuditLogs] = useState<PSIPOPAuditLog[]>(INITIAL_AUDIT_LOGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('dashboard');

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [schoolTypeFilter, setSchoolTypeFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [salaryGradeFilter, setSalaryGradeFilter] = useState('All');
  const [fiscalYearFilter, setFiscalYearFilter] = useState(new Date().getFullYear());

  // Sorting
  const [sortCol, setSortCol] = useState<keyof PlantillaPosition>('item_number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key as string))
  );
  const [showColSettings, setShowColSettings] = useState(false);

  // Selection & detail
  const [selectedPosition, setSelectedPosition] = useState<PlantillaPosition | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PlantillaPosition | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showPsipopExportModal, setShowPsipopExportModal] = useState(false);
  const [psipopExporting, setPsipopExporting] = useState(false);
  const [psipopExportError, setPsipopExportError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PlantillaPosition>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadPlantillaPositions();
      setPositions(data);
      // Real upload history comes from the database — no fake/default rows.
      const logs = await loadImportLogs();
      if (logs.length > 0) setAuditLogs(logs);
    } catch (err) {
      console.error('Error loading plantilla positions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSavePositions = async (newPositions: PlantillaPosition[]) => {
    setPositions(newPositions);
    try {
      await savePlantillaPositions(newPositions);
    } catch (err) {
      // Surface DB write failures instead of silently losing uploads.
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg);
      console.error('Plantilla save failed:', err);
    }
  };

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredPositions = useMemo(() => {
    let result = positions.filter((p) => {
      if (fiscalYearFilter && p.fiscal_year && p.fiscal_year !== fiscalYearFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchItem = p.item_number?.toLowerCase().includes(q);
        const matchTitle = p.position_title?.toLowerCase().includes(q);
        const matchEmp = p.employee_name?.toLowerCase().includes(q);
        const matchSchool = p.school_name?.toLowerCase().includes(q);
        const matchTin = p.tin?.toLowerCase().includes(q);
        if (!matchItem && !matchTitle && !matchEmp && !matchSchool && !matchTin) return false;
      }

      if (schoolTypeFilter !== 'All' && p.school_type !== schoolTypeFilter) return false;
      if (categoryFilter !== 'All' && p.personnel_category !== categoryFilter) return false;
      if (statusFilter !== 'All' && p.position_status !== statusFilter) return false;
      if (salaryGradeFilter !== 'All' && p.salary_grade.toString() !== salaryGradeFilter) return false;

      return true;
    });

    // Sorting
    result = [...result].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (sortDir === 'asc') return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
    });

    return result;
  }, [positions, searchQuery, schoolTypeFilter, categoryFilter, statusFilter, salaryGradeFilter, fiscalYearFilter, sortCol, sortDir]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = positions.length;
    const filled = positions.filter((p) => p.position_status === 'Filled').length;
    const vacant = positions.filter((p) => p.position_status === 'Vacant').length;
    const teaching = positions.filter((p) => p.personnel_category === 'Teaching').length;
    const teachingRelated = positions.filter((p) => p.personnel_category === 'Teaching Related').length;
    const nonTeaching = positions.filter((p) => p.personnel_category === 'Non-Teaching').length;
    const authorizedSalary = positions.reduce((acc, p) => acc + (p.authorized_salary || p.annual_salary || 0), 0);
    const actualSalary = positions.reduce((acc, p) => acc + (p.position_status === 'Filled' ? (p.actual_salary || p.annual_salary || 0) : 0), 0);
    const utilizationRate = total > 0 ? ((filled / total) * 100).toFixed(1) : '0.0';

    return { total, filled, vacant, teaching, teachingRelated, nonTeaching, authorizedSalary, actualSalary, utilizationRate };
  }, [positions]);

  const pagination = usePagination(filteredPositions, 10);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSort = (col: keyof PlantillaPosition) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(pagination.pagedItems.map((p) => p.id));
    else setSelectedIds([]);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleOpenAdd = () => {
    setEditingPosition(null);
    setFormData({
      item_number: `OSEC-DECSB-TCH1-${Math.floor(300000 + Math.random() * 90000)}-2026`,
      position_title: 'Teacher I',
      salary_grade: 11, salary_step: 1,
      annual_salary: 324000, authorized_salary: 324000, actual_salary: 324000,
      school_name: 'Mabini Central Elementary School', school_type: 'Elementary',
      office_assignment: 'Grade School Department',
      personnel_category: 'Teaching', position_status: 'Filled',
      employee_name: '', sex: 'Female', birth_date: '1995-01-01',
      tin: '000-000-000-000', appointment_date: new Date().toISOString().slice(0, 10),
      eligibility: 'LET Passed', employment_status: 'Permanent',
    });
    setShowEditModal(true);
  };

  const handleOpenEdit = (pos: PlantillaPosition) => {
    setEditingPosition(pos);
    setFormData({ ...pos });
    setShowEditModal(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.item_number || !formData.position_title) return;
    const category = classifyPersonnelCategory(formData.position_title || '');
    const isVacant = formData.position_status === 'Vacant';

    if (editingPosition) {
      const updated = positions.map((p) =>
        p.id === editingPosition.id ? ({
          ...p, ...formData,
          personnel_category: category,
          actual_salary: isVacant ? 0 : Number(formData.annual_salary || 0),
          employee_name: isVacant ? '' : formData.employee_name || '',
          updated_at: new Date().toISOString(),
        } as PlantillaPosition) : p
      );
      await handleSavePositions(updated);
      if (logAudit) logAudit('UPDATE', 'PLANTILLA', `Updated item ${formData.item_number}`);
    } else {
      const newPos: PlantillaPosition = {
        id: `pl-${Date.now()}`,
        item_number: formData.item_number || '',
        position_title: formData.position_title || '',
        salary_grade: Number(formData.salary_grade || 11),
        salary_step: Number(formData.salary_step || 1),
        annual_salary: Number(formData.annual_salary || 324000),
        authorized_salary: Number(formData.authorized_salary || 324000),
        actual_salary: isVacant ? 0 : Number(formData.annual_salary || 324000),
        school_id: `SCH-${Math.floor(1000 + Math.random() * 9000)}`,
        school_name: formData.school_name || 'Division Office',
        school_type: (formData.school_type as SchoolType) || 'Elementary',
        office_assignment: formData.office_assignment || 'Main Office',
        employee_id: isVacant ? '' : `EMP-2026-${Math.floor(100 + Math.random() * 900)}`,
        employee_name: isVacant ? '' : formData.employee_name || '',
        sex: isVacant ? '' : (formData.sex as PlantillaPosition['sex']) || 'Female',
        birth_date: isVacant ? '' : formData.birth_date || '',
        tin: isVacant ? '' : formData.tin || '',
        appointment_date: isVacant ? '' : formData.appointment_date || '',
        last_promotion_date: isVacant ? '' : formData.last_promotion_date || '',
        eligibility: formData.eligibility || 'Civil Service Eligible',
        employment_status: isVacant ? '' : 'Permanent',
        personnel_category: category,
        position_status: (formData.position_status as PositionStatus) || 'Filled',
        approval_status: 'Approved',
        fiscal_year: fiscalYearFilter,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await handleSavePositions([newPos, ...positions]);
      if (logAudit) logAudit('CREATE', 'PLANTILLA', `Added item ${newPos.item_number}`);
    }
    setShowEditModal(false);
  };

  const confirmDeleteSingle = async (id: string) => {
    const filtered = positions.filter((p) => p.id !== id);
    setPositions(filtered);
    setSelectedIds((prev) => prev.filter((i) => i !== id));
    if (selectedPosition?.id === id) setSelectedPosition(null);
    setDeleteConfirmId(null);
    await deletePlantillaPosition(id, filtered);
    if (logAudit) logAudit('DELETE', 'PLANTILLA', `Deleted position ${id}`);
  };

  const confirmDeleteBulk = async () => {
    const idsToDelete = [...selectedIds];
    const filtered = positions.filter((p) => !idsToDelete.includes(p.id));
    setPositions(filtered);
    setSelectedIds([]);
    if (selectedPosition && idsToDelete.includes(selectedPosition.id)) setSelectedPosition(null);
    setShowBulkDeleteConfirm(false);
    setShowBulkModal(false);
    await bulkDeletePlantillaPositions(idsToDelete, filtered);
    if (logAudit) logAudit('BULK_DELETE', 'PLANTILLA', `Deleted ${idsToDelete.length} positions`);
  };

  const handleDeleteAll = async () => {
    setPositions([]);
    setSelectedIds([]);
    setSelectedPosition(null);
    setShowDeleteAllConfirm(false);
    await deleteAllPlantillaPositions();
    if (logAudit) logAudit('DELETE_ALL', 'PLANTILLA', 'Deleted all plantilla positions');
  };

  const handleRemoveDuplicates = async () => {
    const { deduped, removedCount } = deduplicatePositions(positions);
    if (removedCount === 0) {
      setShowDuplicateModal(false);
      return;
    }
    setPositions(deduped);
    setShowDuplicateModal(false);
    await savePlantillaPositions(deduped);
    if (logAudit) logAudit('DEDUP', 'PLANTILLA', `Removed ${removedCount} duplicate positions`);
  };

  const handleBulkUpdateStatus = async (newStatus: PositionStatus) => {
    if (selectedIds.length === 0) return;
    const updated = positions.map((p) => {
      if (selectedIds.includes(p.id)) {
        const isVacant = newStatus === 'Vacant';
        return { ...p, position_status: newStatus, actual_salary: isVacant ? 0 : p.annual_salary, employee_name: isVacant ? '' : p.employee_name };
      }
      return p;
    });
    await handleSavePositions(updated);
    setSelectedIds([]);
    setShowBulkModal(false);
    if (logAudit) logAudit('BULK_UPDATE', 'PLANTILLA', `Updated ${selectedIds.length} positions to ${newStatus}`);
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const headers = ['Item Number', 'Position Title', 'Salary Grade', 'Step', 'School Assignment', 'School Type', 'Office Assignment', 'Incumbent', 'Sex', 'Birth Date', 'TIN', 'Appointment Date', 'Eligibility', 'Category', 'Annual Salary', 'Status'];
    const rows = filteredPositions.map((p) => [
      p.item_number, p.position_title, p.salary_grade, p.salary_step,
      p.school_name || '', p.school_type || '', p.office_assignment,
      p.employee_name || 'VACANT', p.sex || '', p.birth_date || '', p.tin || '',
      p.appointment_date || '', p.eligibility || '', p.personnel_category,
      p.annual_salary, p.position_status,
    ]);
    downloadFile({
      filename: `Plantilla_Positions_${new Date().toISOString().slice(0, 10)}.csv`,
      content: generateCsv(headers, rows),
      mimeType: 'text/csv',
    });
  };

  const handleExportPSIPOP = async () => {
    setPsipopExporting(true);
    setPsipopExportError(null);
    try {
      await exportPSIPOPToExcel(filteredPositions.length > 0 ? filteredPositions : positions);
      if (logAudit) logAudit('EXPORT_PSPOP', 'PLANTILLA', `Exported ${(filteredPositions.length > 0 ? filteredPositions : positions).length} records to PSIPOP Excel`);
      setShowPsipopExportModal(false);
    } catch (err) {
      setPsipopExportError(err instanceof Error ? err.message : 'Failed to generate Excel file.');
    } finally {
      setPsipopExporting(false);
    }
  };

  const handleExportPDF = () => window.print();
  const handlePrint = () => window.print();

  const handleImportSuccess = async (newExtracted: PlantillaPosition[]) => {
    // Merge by upserting: new records replace existing ones with the same item_number
    const existingMap = new Map<string, PlantillaPosition>();
    positions.forEach((p) => existingMap.set(p.item_number.toUpperCase(), p));
    let addedCount = 0;
    let updatedCount = 0;
    for (const pos of newExtracted) {
      const key = pos.item_number.toUpperCase();
      if (existingMap.has(key)) {
        updatedCount++;
      } else {
        addedCount++;
      }
      existingMap.set(key, pos);
    }
    const merged = Array.from(existingMap.values());
    await handleSavePositions(merged);
    const newLog: PSIPOPAuditLog = {
      id: `log-${Date.now()}`,
      imported_by: profile?.first_name ? `${profile.first_name} ${profile.last_name}` : 'System',
      import_date: new Date().toLocaleString('en-US'),
      pdf_filename: newExtracted[0]?.source_pdf || 'Imported via PDF Upload',
      fiscal_year: fiscalYearFilter,
      positions_added: addedCount,
      positions_updated: updatedCount,
      positions_vacated: newExtracted.filter((p) => p.position_status === 'Vacant').length,
      positions_filled: newExtracted.filter((p) => p.position_status === 'Filled').length,
      total_records: newExtracted.length,
      status: 'Completed',
    };
    setAuditLogs([newLog, ...auditLogs]);
    // Persist the import to the real audit trail so it survives a reload and
    // shows up under "Recent Imports" on every device.
    try {
      await saveImportLog(newLog);
    } catch (err) {
      console.error('Could not persist import log:', err);
    }
    setActiveTab('positions');
  };

  const availableSalaryGrades = useMemo(() => {
    const grades = new Set(positions.map((p) => p.salary_grade).filter(Boolean));
    return Array.from(grades).sort((a, b) => a - b);
  }, [positions]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* DepEd Branding Header */}
      <DepedHeader
        onImport={() => setActiveTab('import')}
        onAdd={handleOpenAdd}
        onExport={handleExportExcel}
        onExportPSIPOP={() => setShowPsipopExportModal(true)}
        onPrint={handlePrint}
        onRemoveDuplicates={() => setShowDuplicateModal(true)}
        onDeleteAll={() => setShowDeleteAllConfirm(true)}
        positionCount={positions.length}
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
        <NavTab active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={BarChart3} label="Dashboard" />
        <NavTab active={activeTab === 'positions'} onClick={() => setActiveTab('positions')} icon={Briefcase} label="Plantilla Positions" badge={filteredPositions.length} />
        <NavTab active={activeTab === 'import'} onClick={() => setActiveTab('import')} icon={FileUp} label="Import PSIPOP" />
        <NavTab active={activeTab === 'fiscal_year'} onClick={() => setActiveTab('fiscal_year')} icon={Calendar} label="Fiscal Year" />
        <NavTab active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={FileSpreadsheet} label="Reports" />
        <NavTab active={activeTab === 'schools'} onClick={() => setActiveTab('schools')} icon={School} label="School Integration" />
        <NavTab active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={Clock} label="Audit Trail" />
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <DashboardView kpis={kpis} positions={positions} auditLogs={auditLogs} headers={headers} onNavigate={setActiveTab} />}
      {activeTab === 'positions' && (
        <PositionsView
          positions={positions} filteredPositions={filteredPositions} loading={loading}
          pagination={pagination} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          schoolTypeFilter={schoolTypeFilter} setSchoolTypeFilter={setSchoolTypeFilter}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          salaryGradeFilter={salaryGradeFilter} setSalaryGradeFilter={setSalaryGradeFilter}
          availableSalaryGrades={availableSalaryGrades}
          sortCol={sortCol} sortDir={sortDir} handleSort={handleSort}
          selectedIds={selectedIds} handleSelectAll={handleSelectAll} handleToggleSelect={handleToggleSelect}
          selectedPosition={selectedPosition} setSelectedPosition={setSelectedPosition}
          showBulkModal={showBulkModal} setShowBulkModal={setShowBulkModal}
          handleBulkUpdateStatus={handleBulkUpdateStatus} handleBulkDelete={() => setShowBulkDeleteConfirm(true)}
          handleOpenEdit={handleOpenEdit} handleDelete={(id) => setDeleteConfirmId(id)}
          handleExportExcel={handleExportExcel} handleExportPDF={handleExportPDF} handlePrint={handlePrint}
          visibleCols={visibleCols} setVisibleCols={setVisibleCols}
          showColSettings={showColSettings} setShowColSettings={setShowColSettings}
          resetFilters={() => { setSearchQuery(''); setSchoolTypeFilter('All'); setCategoryFilter('All'); setStatusFilter('All'); setSalaryGradeFilter('All'); }}
        />
      )}
      {activeTab === 'import' && <ImportWizard existingPositions={positions} onImportSuccess={handleImportSuccess} />}
      {activeTab === 'fiscal_year' && <FiscalYearView headers={headers} positions={positions} fiscalYear={fiscalYearFilter} setFiscalYear={setFiscalYearFilter} />}
      {activeTab === 'reports' && <ReportsView positions={positions} onExport={handleExportExcel} onPrint={handlePrint} />}
      {activeTab === 'schools' && <SchoolIntegrationView positions={positions} />}
      {activeTab === 'audit' && <AuditTrailView logs={auditLogs} />}

      {/* Edit/Create Modal */}
      {showEditModal && (
        <EditModal
          editingPosition={editingPosition}
          formData={formData}
          setFormData={setFormData}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveModal}
        />
      )}

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <BulkUpdateModal
          count={selectedIds.length}
          onSetFilled={() => handleBulkUpdateStatus('Filled')}
          onSetVacant={() => handleBulkUpdateStatus('Vacant')}
          onDelete={() => setShowBulkDeleteConfirm(true)}
          onClose={() => setShowBulkModal(false)}
        />
      )}

      {/* Delete Confirmation Modals */}
      {deleteConfirmId && (
        <DeleteConfirmModal
          target={positions.find((p) => p.id === deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
          onConfirm={() => confirmDeleteSingle(deleteConfirmId)}
        />
      )}
      {showBulkDeleteConfirm && (
        <DeleteConfirmModal
          bulkCount={selectedIds.length}
          onCancel={() => setShowBulkDeleteConfirm(false)}
          onConfirm={confirmDeleteBulk}
        />
      )}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Delete All Positions</h3>
                <p className="text-xs text-slate-500">This will permanently remove all {positions.length} plantilla positions.</p>
              </div>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300">
              This action cannot be undone. All {positions.length} records will be permanently deleted from the database.
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteAllConfirm(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={handleDeleteAll} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors">Delete All</button>
            </div>
          </div>
        </div>
      )}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-cyan-100 dark:bg-cyan-950/40 flex items-center justify-center">
                <CopyCheck className="w-6 h-6 text-cyan-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Remove Duplicate Positions</h3>
                <p className="text-xs text-slate-500">Deduplicates by Item Number, keeping the first occurrence.</p>
              </div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-xl p-3 text-xs text-cyan-700 dark:text-cyan-300">
              {(() => {
                const { removedCount } = deduplicatePositions(positions);
                if (removedCount === 0) return 'No duplicates found. All positions have unique item numbers.';
                return `${removedCount} duplicate ${removedCount === 1 ? 'position' : 'positions'} will be removed. ${positions.length - removedCount} unique positions will remain.`;
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDuplicateModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={handleRemoveDuplicates} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 transition-colors">Remove Duplicates</button>
            </div>
          </div>
        </div>
      )}
      {showPsipopExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Export PSIPOP Excel Report</h3>
                <p className="text-xs text-slate-500">Generates a CSC-ready .xlsx file following the official PSIPOP template.</p>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between"><span>Records to export</span><span className="font-bold text-slate-900 dark:text-white">{(filteredPositions.length > 0 ? filteredPositions : positions).length}</span></div>
              <div className="flex items-center justify-between"><span>Column count</span><span className="font-bold text-slate-900 dark:text-white">29 (PSIPOP template)</span></div>
              <div className="flex items-center justify-between"><span>File format</span><span className="font-bold text-slate-900 dark:text-white">.xlsx (Excel)</span></div>
              <div className="flex items-center justify-between"><span>File name</span><span className="font-mono font-bold text-slate-900 dark:text-white">PSIPOP_Report_{new Date().getFullYear()}{String(new Date().getMonth() + 1).padStart(2, '0')}{String(new Date().getDate()).padStart(2, '0')}.xlsx</span></div>
            </div>
            <div className="text-[11px] text-slate-400 space-y-1">
              <p>- Auto-computes Age from Date of Birth</p>
              <p>- Formats all dates as MM/DD/YYYY</p>
              <p>- Dark blue header, white bold text, alternating row colors</p>
              <p>- Frozen header row with auto-filter enabled</p>
            </div>
            {psipopExportError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{psipopExportError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowPsipopExportModal(false); setPsipopExportError(null); }} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={handleExportPSIPOP} disabled={psipopExporting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {psipopExporting ? <><LoadingIndicator size={40} /> Generating...</> : <><FileSpreadsheet className="w-4 h-4" /> Export PSIPOP</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: DEPED HEADER
// ════════════════════════════════════════════════════════════════════════════
function DepedHeader({ onImport, onAdd, onExport, onExportPSIPOP, onPrint, onRemoveDuplicates, onDeleteAll, positionCount }: {
  onImport: () => void; onAdd: () => void; onExport: () => void; onExportPSIPOP: () => void; onPrint: () => void;
  onRemoveDuplicates: () => void; onDeleteAll: () => void; positionCount: number;
}) {
  return (
    <div className="bg-gradient-to-r from-depedblue-700 via-depedblue-600 to-depedblue-800 text-white p-5 rounded-2xl shadow-premium space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
            <Briefcase className="w-7 h-7 text-depedgold-400" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-depedgold-400">
              Republic of the Philippines • Department of Education
            </div>
            <h1 className="text-xl font-black tracking-tight text-white">Plantilla Positions Management System</h1>
            <p className="text-xs text-depedblue-100 mt-0.5">
              PSIPOP Import • DBM Plantilla Reports • Fiscal Year Management
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/10">
        <button onClick={onImport} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-depedgold-400 hover:bg-depedgold-300 text-slate-900 font-bold text-xs shadow-sm transition-colors">
          <FileUp className="w-4 h-4" /> Import PSIPOP PDF
        </button>
        <button onClick={onAdd} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-colors">
          <Plus className="w-4 h-4 text-emerald-400" /> Add Position
        </button>
        <button onClick={onExport} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-colors">
          <FileDown className="w-4 h-4 text-depedblue-200" /> Export CSV
        </button>
        <button onClick={onExportPSIPOP} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-semibold text-xs border border-emerald-400/30 transition-colors">
          <FileSpreadsheet className="w-4 h-4" /> Export PSIPOP Excel
        </button>
        <button onClick={onPrint} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-colors">
          <Printer className="w-4 h-4 text-slate-300" /> Print
        </button>
        {positionCount > 0 && (
          <>
            <button onClick={onRemoveDuplicates} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-colors">
              <CopyCheck className="w-4 h-4 text-cyan-300" /> Remove Duplicates
            </button>
            <button onClick={onDeleteAll} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold text-xs border border-rose-400/30 transition-colors">
              <Trash2 className="w-4 h-4" /> Delete All
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: DASHBOARD VIEW
// ════════════════════════════════════════════════════════════════════════════
function DashboardView({ kpis, positions, auditLogs, headers, onNavigate }: {
  kpis: KpiData;
  positions: PlantillaPosition[];
  auditLogs: PSIPOPAuditLog[];
  headers: PlantillaHeader[];
  onNavigate: (tab: ViewTab) => void;
}) {
  const topPositions = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach((p) => map.set(p.position_title, (map.get(p.position_title) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [positions]);

  const genderDist = useMemo(() => {
    const male = positions.filter((p) => p.sex === 'Male' || p.sex === 'M').length;
    const female = positions.filter((p) => p.sex === 'Female' || p.sex === 'F').length;
    return { male, female };
  }, [positions]);

  const eligibilityDist = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach((p) => {
      const elig = p.eligibility || p.civil_service_eligibility || 'Unspecified';
      map.set(elig, (map.get(elig) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [positions]);

  const officeDist = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach((p) => {
      const office = p.school_name || p.office_assignment || 'Unknown';
      map.set(office, (map.get(office) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [positions]);

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <DashboardKpi label="Total Positions" value={kpis.total.toLocaleString()} icon={Briefcase} color="from-depedblue-600 to-depedblue-800" />
        <DashboardKpi label="Filled" value={kpis.filled.toLocaleString()} icon={UserCheck} color="from-emerald-500 to-emerald-700" trend="up" />
        <DashboardKpi label="Vacant" value={kpis.vacant.toLocaleString()} icon={UserX} color="from-rose-500 to-rose-700" trend="down" />
        <DashboardKpi label="Authorized Budget" value={`₱${(kpis.authorizedSalary / 1000000).toFixed(1)}M`} icon={DollarSign} color="from-blue-500 to-blue-700" />
        <DashboardKpi label="Actual Budget" value={`₱${(kpis.actualSalary / 1000000).toFixed(1)}M`} icon={DollarSign} color="from-indigo-500 to-indigo-700" />
        <DashboardKpi label="Fill Rate" value={`${kpis.utilizationRate}%`} icon={ShieldCheck} color="from-amber-500 to-amber-700" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Personnel Distribution */}
        <div className="enterprise-card p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-depedblue-600" /> Personnel Distribution
          </h3>
          <div className="space-y-3">
            <DistributionBar label="Teaching" count={kpis.teaching} total={kpis.total} color="bg-depedblue-600" />
            <DistributionBar label="Teaching Related" count={kpis.teachingRelated} total={kpis.total} color="bg-amber-500" />
            <DistributionBar label="Non-Teaching" count={kpis.nonTeaching} total={kpis.total} color="bg-slate-400" />
          </div>
        </div>

        {/* Gender Distribution */}
        <div className="enterprise-card p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-depedblue-600" /> Gender Distribution
          </h3>
          <div className="flex items-center justify-center gap-6 py-2">
            <div className="text-center">
              <div className="text-2xl font-black text-depedblue-600">{genderDist.male}</div>
              <div className="text-xs text-slate-500 font-medium">Male</div>
            </div>
            <div className="w-px h-12 bg-slate-200 dark:bg-slate-700" />
            <div className="text-center">
              <div className="text-2xl font-black text-rose-500">{genderDist.female}</div>
              <div className="text-xs text-slate-500 font-medium">Female</div>
            </div>
          </div>
        </div>

        {/* Fill Rate Donut */}
        <div className="enterprise-card p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-depedblue-600" /> Fill Rate
          </h3>
          <div className="flex items-center justify-center">
            <DonutChart filled={kpis.filled} vacant={kpis.vacant} />
          </div>
        </div>
      </div>

      {/* Second Row: Top Positions + Office Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="enterprise-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-depedblue-600" /> Top Position Titles
          </h3>
          <div className="space-y-2">
            {topPositions.map(([title, count], i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-medium">{title}</span>
                <span className="px-2 py-0.5 rounded-full bg-depedblue-50 dark:bg-depedblue-900/30 text-depedblue-700 dark:text-depedblue-300 font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="enterprise-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-depedblue-600" /> Plantilla by Office
          </h3>
          <div className="space-y-2">
            {officeDist.map(([office, count], i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[200px]">{office}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Imports */}
      <div className="enterprise-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-depedblue-600" /> Recent Imports
          </h3>
          <button onClick={() => onNavigate('audit')} className="text-xs text-depedblue-600 hover:underline font-medium">View All</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-500 uppercase font-semibold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="p-2">Date</th><th className="p-2">File</th><th className="p-2 text-center">Added</th>
                <th className="p-2 text-center">Updated</th><th className="p-2 text-center">Filled</th><th className="p-2 text-center">Vacated</th><th className="p-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {auditLogs.slice(0, 5).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="p-2 text-slate-600 dark:text-slate-400">{log.import_date}</td>
                  <td className="p-2 font-mono text-depedblue-600 dark:text-depedblue-400 truncate max-w-[200px]">{log.pdf_filename}</td>
                  <td className="p-2 text-center font-bold text-emerald-600">+{log.positions_added}</td>
                  <td className="p-2 text-center font-bold text-blue-600">{log.positions_updated}</td>
                  <td className="p-2 text-center font-bold text-emerald-700">{log.positions_filled}</td>
                  <td className="p-2 text-center font-bold text-rose-600">{log.positions_vacated}</td>
                  <td className="p-2 text-center"><span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{log.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fiscal Year Statistics */}
      <div className="enterprise-card p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-depedblue-600" /> Fiscal Year Statistics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {headers.map((h) => (
            <div key={h.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="text-xs font-bold text-depedblue-700 dark:text-depedblue-300">FY {h.fiscal_year}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{h.division_office}</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Total</span>
                <span className="font-bold text-slate-900 dark:text-white">{h.total_positions}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Filled</span>
                <span className="font-bold text-emerald-600">{h.filled_positions}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Vacant</span>
                <span className="font-bold text-rose-600">{h.unfilled_positions}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">Authorized</span>
                <span className="font-bold text-slate-900 dark:text-white">₱{(h.authorized_amount / 1000000).toFixed(1)}M</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: POSITIONS VIEW (Data Grid)
// ════════════════════════════════════════════════════════════════════════════
function PositionsView(props: {
  positions: PlantillaPosition[]; filteredPositions: PlantillaPosition[]; loading: boolean;
  pagination: ReturnType<typeof usePagination<PlantillaPosition>>;
  searchQuery: string; setSearchQuery: (v: string) => void;
  schoolTypeFilter: string; setSchoolTypeFilter: (v: string) => void;
  categoryFilter: string; setCategoryFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  salaryGradeFilter: string; setSalaryGradeFilter: (v: string) => void;
  availableSalaryGrades: number[];
  sortCol: keyof PlantillaPosition; sortDir: SortDir; handleSort: (col: keyof PlantillaPosition) => void;
  selectedIds: string[]; handleSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void; handleToggleSelect: (id: string) => void;
  selectedPosition: PlantillaPosition | null; setSelectedPosition: (p: PlantillaPosition | null) => void;
  showBulkModal: boolean; setShowBulkModal: (v: boolean) => void;
  handleBulkUpdateStatus: (s: PositionStatus) => void; handleBulkDelete: () => void;
  handleOpenEdit: (p: PlantillaPosition) => void; handleDelete: (id: string) => void;
  handleExportExcel: () => void; handleExportPDF: () => void; handlePrint: () => void;
  visibleCols: Set<string>; setVisibleCols: (s: Set<string>) => void;
  showColSettings: boolean; setShowColSettings: (v: boolean) => void;
  resetFilters: () => void;
}) {
  const { pagination: p, filteredPositions, loading, visibleCols, showColSettings, setShowColSettings, setVisibleCols } = props;
  const visibleColumns = ALL_COLUMNS.filter((c) => visibleCols.has(c.key as string));

  const toggleColumn = (key: string) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key); else next.add(key);
    setVisibleCols(next);
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="enterprise-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="Search item number, position, employee, school, TIN..."
              value={props.searchQuery} onChange={(e) => props.setSearchQuery(e.target.value)}
              className="input-base pl-9"
            />
          </div>
          <select value={props.schoolTypeFilter} onChange={(e) => props.setSchoolTypeFilter(e.target.value)} className="input-base">
            <option value="All">All School Types</option>
            <option value="Elementary">Elementary</option>
            <option value="High School">High School</option>
            <option value="Implementing Unit">Implementing Unit</option>
            <option value="Division Office">Division Office</option>
          </select>
          <select value={props.categoryFilter} onChange={(e) => props.setCategoryFilter(e.target.value)} className="input-base">
            <option value="All">All Categories</option>
            <option value="Teaching">Teaching</option>
            <option value="Teaching Related">Teaching Related</option>
            <option value="Non-Teaching">Non-Teaching</option>
          </select>
          <select value={props.statusFilter} onChange={(e) => props.setStatusFilter(e.target.value)} className="input-base">
            <option value="All">All Statuses</option>
            <option value="Filled">Filled</option>
            <option value="Vacant">Vacant</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={props.salaryGradeFilter} onChange={(e) => props.setSalaryGradeFilter(e.target.value)} className="input-base !w-auto text-xs">
            <option value="All">All Salary Grades</option>
            {props.availableSalaryGrades.map((g) => <option key={g} value={g.toString()}>SG {g}</option>)}
          </select>
          <div className="relative">
            <button onClick={() => setShowColSettings(!showColSettings)} className="btn-secondary !text-xs">
              <Columns3 className="w-3.5 h-3.5" /> Columns
            </button>
            {showColSettings && (
              <div className="absolute top-full mt-1 left-0 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 space-y-1 min-w-[200px] max-h-64 overflow-y-auto">
                {ALL_COLUMNS.map((col) => (
                  <label key={col.key as string} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 rounded-lg">
                    <input type="checkbox" checked={visibleCols.has(col.key as string)} onChange={() => toggleColumn(col.key as string)} className="rounded border-slate-300 text-depedblue-600" />
                    <span className="text-slate-700 dark:text-slate-300">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1" />
          <span className="text-xs text-slate-500">
            Showing <strong className="text-slate-800 dark:text-slate-200">{filteredPositions.length}</strong> of {props.positions.length}
          </span>
          {props.selectedIds.length > 0 && (
            <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{props.selectedIds.length} selected</span>
          )}
          {props.selectedIds.length > 0 && (
            <button onClick={() => props.setShowBulkModal(true)} className="btn-primary !text-xs !py-1.5">Bulk Actions</button>
          )}
          <button onClick={props.resetFilters} className="btn-ghost !text-xs"><RotateCcw className="w-3.5 h-3.5" /> Reset</button>
          <button onClick={props.handleExportExcel} className="btn-secondary !text-xs !py-1.5"><FileDown className="w-3.5 h-3.5" /> CSV</button>
          <button onClick={props.handleExportPDF} className="btn-secondary !text-xs !py-1.5"><Download className="w-3.5 h-3.5" /> PDF</button>
        </div>
      </div>

      {/* Data Grid + Detail Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className={`${props.selectedPosition ? 'xl:col-span-8' : 'xl:col-span-12'} transition-all`}>
          <div className="enterprise-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 text-[10px]">
                  <tr>
                    <th className="p-2.5 w-8 text-center">
                      <input type="checkbox" onChange={props.handleSelectAll}
                        checked={p.pagedItems.length > 0 && p.pagedItems.every((pos) => props.selectedIds.includes(pos.id))}
                        className="rounded border-slate-300 text-depedblue-600" />
                    </th>
                    {visibleColumns.map((col) => (
                      <th key={col.key as string} className="px-2.5 py-3 whitespace-nowrap">
                        {col.sortable ? (
                          <button onClick={() => props.handleSort(col.key)} className="flex items-center gap-1 hover:text-depedblue-600">
                            {col.label}
                            {props.sortCol === col.key && (props.sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </button>
                        ) : col.label}
                      </th>
                    ))}
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {loading ? (
                    <tr><td colSpan={visibleColumns.length + 2} className="p-8 text-center text-slate-400">Loading plantilla positions...</td></tr>
                  ) : p.pagedItems.length === 0 ? (
                    <tr><td colSpan={visibleColumns.length + 2} className="p-8 text-center text-slate-400">No plantilla positions found matching filters.</td></tr>
                  ) : p.pagedItems.map((pos) => (
                    <tr key={pos.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer ${props.selectedPosition?.id === pos.id ? 'bg-depedblue-50/60 dark:bg-depedblue-950/30 font-medium' : ''}`}
                      onClick={() => props.setSelectedPosition(pos)}>
                      <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.selectedIds.includes(pos.id)} onChange={() => props.handleToggleSelect(pos.id)} className="rounded border-slate-300 text-depedblue-600" />
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={col.key as string} className="px-2.5 py-2.5 whitespace-nowrap">
                          {renderCell(pos, col.key)}
                        </td>
                      ))}
                      <td className="px-2.5 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => props.setSelectedPosition(pos)} title="View" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-depedblue-600"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => props.handleOpenEdit(pos)} title="Edit" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => props.handleDelete(pos.id)} title="Delete" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={p} label="plantilla positions" />
          </div>
        </div>

        {/* Detail Panel */}
        {props.selectedPosition && (
          <div className="xl:col-span-4 enterprise-card p-5 space-y-5 relative animate-fade-in max-h-[85vh] overflow-y-auto">
            <button onClick={() => props.setSelectedPosition(null)} className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
            <EmployeeDetailPanel position={props.selectedPosition} onEdit={() => props.handleOpenEdit(props.selectedPosition!)} onDelete={() => props.handleDelete(props.selectedPosition!.id)} />
          </div>
        )}
      </div>
    </div>
  );
}

function renderCell(pos: PlantillaPosition, key: keyof PlantillaPosition): React.ReactNode {
  switch (key) {
    case 'item_number':
      return <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{pos.item_number}</span>;
    case 'position_title':
      return <span className="font-medium text-slate-900 dark:text-white">{pos.position_title}</span>;
    case 'salary_grade':
      return <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300">SG {pos.salary_grade}</span>;
    case 'authorized_salary':
      return <span className="font-mono font-medium text-slate-800 dark:text-slate-200">₱{(pos.authorized_salary || pos.annual_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>;
    case 'actual_salary':
      return <span className="font-mono font-semibold text-slate-900 dark:text-white">₱{(pos.actual_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>;
    case 'employee_name':
      return pos.position_status === 'Vacant'
        ? <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-bold uppercase">VACANT</span>
        : <span className="font-semibold text-slate-900 dark:text-white">{pos.employee_name}</span>;
    case 'position_status':
      return <StatusBadge status={pos.position_status} />;
    case 'sex':
      return pos.sex || '—';
    case 'birth_date':
      return pos.birth_date || pos.date_of_birth || '—';
    case 'tin':
      return <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400">{pos.tin || '—'}</span>;
    case 'appointment_date':
      return pos.appointment_date || pos.original_appointment_date || '—';
    case 'last_promotion_date':
      return pos.last_promotion_date || '—';
    case 'eligibility':
      return pos.eligibility || pos.civil_service_eligibility || '—';
    case 'ppa_attribution':
      return <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400">{pos.ppa_attribution || '—'}</span>;
    case 'level':
      return pos.level || '—';
    case 'appointment_type':
      return pos.appointment_type || pos.employment_status || '—';
    case 'education':
      return pos.education || '—';
    default:
      return String(pos[key] ?? '—');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: EMPLOYEE DETAIL PANEL
// ════════════════════════════════════════════════════════════════════════════
function EmployeeDetailPanel({ position, onEdit, onDelete }: {
  position: PlantillaPosition; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <>
      <div className="border-b border-slate-100 dark:border-slate-800 pb-3 pr-8">
        <div className="flex items-center gap-2 mb-1.5">
          <StatusBadge status={position.position_status} />
          <CategoryBadge category={position.personnel_category} />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-snug">{position.position_title}</h3>
        <p className="text-xs font-mono font-bold text-depedblue-600 dark:text-depedblue-400 mt-0.5">Item No: {position.item_number}</p>
      </div>

      <DetailSection title="A. Personal Information" icon={Users}>
        <DetailRow label="Full Name" value={position.employee_name || '(VACANT)'} isBold={Boolean(position.employee_name)} />
        <DetailRow label="Sex" value={position.sex || '—'} />
        <DetailRow label="Date of Birth" value={position.birth_date || position.date_of_birth || '—'} />
        <DetailRow label="TIN" value={position.tin || '—'} />
      </DetailSection>

      <DetailSection title="B. Position Information" icon={Briefcase}>
        <DetailRow label="Item Number" value={position.item_number} isBold />
        <DetailRow label="Position Title" value={position.position_title} />
        <DetailRow label="Salary Grade & Step" value={`SG ${position.salary_grade} (Step ${position.salary_step || position.step || 1})`} />
        <DetailRow label="Authorized Salary" value={`₱${(position.authorized_salary || position.annual_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
        <DetailRow label="Actual Salary" value={`₱${(position.actual_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
      </DetailSection>

      <DetailSection title="C. Appointment Information" icon={Award}>
        <DetailRow label="Appointment Type" value={position.appointment_type || position.employment_status || 'Permanent'} />
        <DetailRow label="Original Appointment" value={position.original_appointment_date || position.appointment_date || '—'} />
        <DetailRow label="Last Promotion" value={position.last_promotion_date || '—'} />
        <DetailRow label="Eligibility" value={position.eligibility || position.civil_service_eligibility || '—'} />
      </DetailSection>

      <DetailSection title="D. Audit Information" icon={ShieldCheck}>
        <DetailRow label="Created Date" value={position.created_at ? new Date(position.created_at).toLocaleDateString() : '—'} />
        <DetailRow label="Last Updated" value={position.updated_at ? new Date(position.updated_at).toLocaleDateString() : '—'} />
        <DetailRow label="Imported By" value={position.imported_by || 'System'} />
        <DetailRow label="Source PDF" value={position.source_pdf || 'Manual Entry'} />
      </DetailSection>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <button onClick={onEdit} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-depedblue-700 hover:bg-depedblue-800 text-white font-medium text-xs transition-colors shadow-sm">
          <Pencil className="w-4 h-4" /> Edit Position
        </button>
        <button onClick={onDelete} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-medium text-xs transition-colors">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: DIAGNOSTIC PANEL — actionable guidance when extraction finds nothing
// ════════════════════════════════════════════════════════════════════════════
const OCR_ERROR_GUIDANCE: Record<OcrErrorCategory, { title: string; causes: string[]; actions: string[] }> = {
  'worker-init': {
    title: 'OCR engine failed to start',
    causes: ['The Tesseract.js OCR worker could not be initialized in your browser.', 'A browser extension may be blocking Web Workers.'],
    actions: ['Try a different browser (Chrome or Edge recommended).', 'Disable browser extensions and retry.', 'Refresh the page and try again.'],
  },
  'language-data': {
    title: 'OCR language files could not be loaded',
    causes: ['The English language data (eng.traineddata) could not be downloaded.', 'Your network may be blocking the CDN that hosts the OCR data.', 'A CORS or firewall restriction is preventing the download.'],
    actions: ['Check your internet connection and retry.', 'If on a restricted network, ask your IT admin to allow CDN access.', 'Upload a searchable (text-based) PDF instead of a scanned copy.'],
  },
  'pdf-load': {
    title: 'PDF could not be opened',
    causes: ['The PDF file may be corrupted or password-protected.', 'The file may not actually be a valid PDF.'],
    actions: ['Re-download or re-export the PDF from the original source.', 'Remove any password protection from the PDF.', 'Try a different PDF file.'],
  },
  'pdf-render': {
    title: 'PDF page could not be rendered',
    causes: ['A page in the PDF could not be converted to an image for OCR.', 'The PDF may contain embedded content that the renderer does not support.'],
    actions: ['Try exporting the PDF again from the original application.', 'Convert the PDF to images (JPG/PNG) and upload those instead.'],
  },
  'canvas': {
    title: 'Canvas rendering failed',
    causes: ['Your browser could not create a canvas element for OCR processing.'],
    actions: ['Try a different browser (Chrome or Edge recommended).', 'Refresh the page and try again.'],
  },
  'image-load': {
    title: 'Image could not be loaded',
    causes: ['The image file may be corrupted or in an unsupported format.'],
    actions: ['Try a different image file (JPG or PNG recommended).', 'Re-save the image in a standard format.'],
  },
  'memory': {
    title: 'Browser memory limit exceeded',
    causes: ['The PDF is too large or has too many high-resolution pages for in-browser OCR.', 'Your browser ran out of memory while processing the images.'],
    actions: ['Upload fewer pages at a time (split the PDF).', 'Reduce the scan resolution and try again.', 'Close other browser tabs and retry.', 'Use a machine with more RAM.'],
  },
  'recognize': {
    title: 'OCR recognition failed',
    causes: ['The OCR engine encountered an error while reading the text from the image.'],
    actions: ['Refresh the page and try again.', 'Try a clearer or higher-resolution scan.', 'Upload a searchable (text-based) PDF instead.'],
  },
  'unknown': {
    title: 'OCR processing failed',
    causes: ['An unexpected error occurred during OCR processing.', 'The OCR engine may not be properly configured.'],
    actions: ['Refresh the page and try again.', 'Upload a searchable (text-based) PDF if available.', 'Re-scan the document at 300 DPI or higher.', 'Contact support if the issue persists.'],
  },
};

function DiagnosticPanel({ diagnostic }: {
  diagnostic: NonNullable<ExtractedPSIPOPResult['diagnostic']>;
}) {
  const strategies = diagnostic.strategiesTried;
  const hasOcrError = diagnostic.ocrErrorCategory != null;
  const guidance = hasOcrError ? OCR_ERROR_GUIDANCE[diagnostic.ocrErrorCategory!] : null;

  const strategyLabels: Record<string, string> = {
    'column-per-record': 'PDF Text Extraction',
    'text-line': 'Structured Record Detection',
    'ocr': 'OCR Image Recognition',
    'ocr-image': 'OCR Image Recognition',
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500" /> Extraction Diagnostics
      </h4>

      {/* Strategies Tried */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Strategies Tried:</span>
        {strategies.map((s, i) => {
          const label = strategyLabels[s] || s;
          const isOcr = s.startsWith('ocr');
          const ocrFailed = isOcr && !diagnostic.ocrUsed;
          const ocrSucceeded = isOcr && diagnostic.ocrUsed;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              {ocrFailed ? (
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
              ) : ocrSucceeded ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className={ocrFailed ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-600 dark:text-slate-400'}>
                {label}
                {ocrSucceeded && diagnostic.ocrConfidence != null && (
                  <span className="ml-1.5 text-amber-600 dark:text-amber-400">({diagnostic.ocrConfidence}% confidence)</span>
                )}
                {ocrFailed && <span className="ml-1.5 text-rose-500">— FAILED</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Results Summary */}
      <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          {diagnostic.textItemCount === 0 ? (
            <><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> <span>No embedded text layer found. {diagnostic.rawTextSample.includes('image file') ? 'File is an image.' : 'PDF appears to be a scanned image.'}</span></>
          ) : (
            <><CheckCircle2 className="w-3.5 h-3.5 text-slate-400" /> <span>Text items found: {diagnostic.textItemCount}</span></>
          )}
        </div>
        {hasOcrError ? (
          <div className="flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-rose-500" /> <span>OCR extraction could not be completed.</span>
          </div>
        ) : diagnostic.ocrUsed ? (
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> <span>OCR ran but no OSEC-DECSB plantilla items were detected.</span>
          </div>
        ) : null}
      </div>

      {/* OCR Error Details */}
      {hasOcrError && guidance && (
        <div className="bg-rose-50 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-200 dark:border-rose-800 space-y-2">
          <h5 className="text-xs font-bold text-rose-800 dark:text-rose-300">{guidance.title}</h5>
          {diagnostic.ocrErrorDetail && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-mono break-all">{diagnostic.ocrErrorDetail}</p>
          )}
          <div className="space-y-1">
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">Possible Causes:</span>
            <ul className="text-xs text-rose-600 dark:text-rose-400 space-y-0.5 list-disc list-inside ml-1">
              {guidance.causes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* No Records Found Guidance */}
      {!hasOcrError && diagnostic.ocrUsed && (
        <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
          <h5 className="text-xs font-bold text-amber-800 dark:text-amber-300">No OSEC-DECSB Plantilla Items Detected</h5>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Possible Reasons:</span>
            <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5 list-disc list-inside ml-1">
              <li>Uploaded file is not a PSIPOP Plantilla Report</li>
              <li>OCR text quality is too low to read item numbers</li>
              <li>Item numbers are unreadable due to low scan quality</li>
              <li>Wrong report type was uploaded</li>
            </ul>
          </div>
          <div className="space-y-1 mt-2">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Expected Patterns:</span>
            <div className="text-xs font-mono text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20 p-2 rounded">
              OSEC-DECSB-* &nbsp; OSEC-DECSB-TCH* &nbsp; OSEC-DECSB-ADA*
            </div>
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      <div className="bg-depedblue-50 dark:bg-depedblue-950/20 p-3 rounded-lg border border-depedblue-200 dark:border-depedblue-800 space-y-1.5">
        <h5 className="text-xs font-bold text-depedblue-800 dark:text-depedblue-300 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Recommended Actions
        </h5>
        <ol className="text-xs text-depedblue-700 dark:text-depedblue-400 space-y-0.5 list-decimal list-inside ml-1">
          {(guidance?.actions || [
            'Upload the original PSIPOP PDF export if available.',
            'Re-scan at 300 DPI or higher for better OCR accuracy.',
            'Ensure the document contains OSEC-DECSB plantilla item numbers.',
            'Try a text-based (searchable) PDF instead of a scanned copy.',
          ]).map((a, i) => <li key={i}>{a}</li>)}
        </ol>
      </div>

      {/* Raw Samples (collapsible) */}
      {diagnostic.rawTextSample && diagnostic.rawTextSample !== '(no text extracted)' && !diagnostic.rawTextSample.includes('image file') && (
        <div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Raw text sample (first 500 chars):</span>
          <pre className="mt-1 p-2 bg-white dark:bg-slate-900 rounded text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-700">{diagnostic.rawTextSample}</pre>
        </div>
      )}
      {diagnostic.ocrSample && diagnostic.ocrSample !== '(empty)' && (
        <div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">OCR text sample (first 500 chars):</span>
          <pre className="mt-1 p-2 bg-white dark:bg-slate-900 rounded text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-700">{diagnostic.ocrSample}</pre>
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        <XCircle className="w-4 h-4 text-rose-500" />
        <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Plantilla extraction unsuccessful.</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: IMPORT WIZARD
// ════════════════════════════════════════════════════════════════════════════
function ImportWizard({ existingPositions, onImportSuccess }: {
  existingPositions: PlantillaPosition[];
  onImportSuccess: (extracted: PlantillaPosition[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ExtractedPSIPOPResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ocrStage, setOcrStage] = useState('');
  const [ocrActive, setOcrActive] = useState(false);

  const processFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setParsing(true);
    setProgress(0);
    setResults(null);
    setOcrStage('');
    setOcrActive(false);

    try {
      let allPositions: PlantillaPosition[] = [];
      let lastResult: ExtractedPSIPOPResult | null = null;
      const allWarnings: string[] = [];
      const allErrors: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const basePercent = Math.round((i / fileList.length) * 100);
        setProgress(basePercent);

        const isImage = isImageFile(file);
        const isPdf = isPdfFile(file);

        // Show OCR indicator for image files and scanned PDFs
        if (isImage) {
          setOcrActive(true);
          setOcrStage(`Running OCR on image: ${file.name}`);
        }

        let result: ExtractedPSIPOPResult;
        if (isPdf || isImage) {
          result = await extractAndParseFile(
            file,
            existingPositions,
            (info: OcrProgressInfo) => {
              setOcrActive(true);
              setOcrStage(info.stage);
              const fileBase = Math.round((i / fileList.length) * 100);
              const fileRange = Math.round(1 / fileList.length * 100);
              setProgress(fileBase + Math.round((info.percent / 100) * fileRange));
            },
          );
        } else {
          const rawText = await file.text();
          result = parsePSIPOPText(rawText, file.name, existingPositions);
        }

        setOcrActive(false);
        setOcrStage('');

        allPositions = [...allPositions, ...result.positions];
        allWarnings.push(...result.warnings.map((w) => `[${file.name}] ${w}`));
        allErrors.push(...result.errors.map((e) => `[${file.name}] ${e}`));
        lastResult = result;
      }

      setProgress(100);

      if (lastResult) {
        setResults({
          ...lastResult,
          positions: allPositions,
          totalExtracted: allPositions.length,
          warnings: allWarnings,
          errors: allErrors,
          filename: fileList.map((f) => f.name).join(', '),
        });
      }
    } catch (err) {
      console.error('PSIPOP parsing error:', err);
      setResults({
        ...parsePSIPOPText('', 'error', existingPositions),
        errors: ['An unexpected error occurred while processing the file.'],
      });
    } finally {
      setParsing(false);
      setOcrActive(false);
      setOcrStage('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      isOcrSupportedFile(f) ||
      f.name.toLowerCase().endsWith('.txt') ||
      f.name.toLowerCase().endsWith('.csv')
    );
    if (dropped.length > 0) {
      setFiles(dropped);
      processFiles(dropped);
    }
  };

  return (
    <div className="enterprise-card p-6 space-y-5">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileUp className="w-5 h-5 text-depedblue-600" /> PSIPOP Document Import Wizard
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Upload official DepEd PSIPOP files to automatically extract plantilla positions, incumbents, salary grades, and personnel information. Supports text-based PDFs, scanned PDFs, and images (JPG, PNG) — OCR runs automatically when no text layer is detected. Bulk upload supported.
        </p>
      </div>

      {/* Drag & Drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${dragOver ? 'border-depedblue-500 bg-depedblue-50/50 dark:bg-depedblue-950/20' : 'border-slate-300 dark:border-slate-700 hover:border-depedblue-400 bg-slate-50 dark:bg-slate-800/40'}`}
      >
        <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-depedblue-600 scale-110' : 'text-depedblue-600 animate-bounce'} transition-all`} />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Drag & Drop PSIPOP Files Here</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">Supported formats: PDF, JPG, PNG, WebP, TXT, CSV — scanned documents are processed automatically with OCR</p>
        <label className="btn-primary cursor-pointer">
          <FileText className="w-4 h-4" /> Choose Files
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.txt,.csv" multiple onChange={(e) => { if (e.target.files) { const fl = Array.from(e.target.files); setFiles(fl); processFiles(fl); } }} className="hidden" />
        </label>
        {files.length > 0 && (
          <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
            {files.length} file(s) selected: {files.map((f) => f.name).join(', ')}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {parsing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-semibold">
              {ocrActive ? (
                <><LoadingIndicator size={40} /> {ocrStage || 'Running OCR...'}</>
              ) : (
                <><LoadingIndicator size={40} /> Extracting positions...</>
              )}
            </span>
            <span className="font-bold text-depedblue-600">{progress}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-300 ${ocrActive ? 'bg-gradient-to-r from-depedblue-500 to-cyan-500' : 'bg-depedblue-600'}`} style={{ width: `${progress}%` }} />
          </div>
          {ocrActive && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
              OCR processing happens entirely in your browser — no data is uploaded to any server.
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {results && !parsing && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary Header */}
          <div className="flex items-center justify-between bg-depedblue-50 dark:bg-depedblue-950/30 p-4 rounded-xl border border-depedblue-200 dark:border-depedblue-800">
            <div>
              <h4 className="text-xs font-bold text-depedblue-900 dark:text-depedblue-200">Extraction Preview: {results.filename}</h4>
              <p className="text-xs text-depedblue-700 dark:text-depedblue-300">Found {results.totalExtracted} plantilla position records.</p>
            </div>
            <button onClick={() => onImportSuccess(results.positions)} disabled={results.totalExtracted === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Commit & Save
            </button>
          </div>

          {/* Document Header Info */}
          {results.documentHeader && (
            <div className="enterprise-card p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-depedblue-600" /> Document Header
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                <div><span className="text-slate-500">Fiscal Year</span><div className="font-bold text-depedblue-700 dark:text-depedblue-300">FY {results.documentHeader.fiscalYear}</div></div>
                <div><span className="text-slate-500">Department</span><div className="font-bold text-slate-800 dark:text-slate-200">{results.documentHeader.department}</div></div>
                <div><span className="text-slate-500">Office/Division</span><div className="font-bold text-slate-800 dark:text-slate-200">{results.documentHeader.divisionOffice}</div></div>
                <div><span className="text-slate-500">Total Positions</span><div className="font-bold text-slate-800 dark:text-slate-200">{results.documentHeader.totalPositions}</div></div>
                <div><span className="text-slate-500">Filled / Unfilled</span><div className="font-bold"><span className="text-emerald-600">{results.documentHeader.filledPositions}</span> / <span className="text-rose-600">{results.documentHeader.unfilledPositions}</span></div></div>
                <div><span className="text-slate-500">Authorized Amount</span><div className="font-bold font-mono text-slate-800 dark:text-slate-200">₱{results.documentHeader.authorizedAmount.toLocaleString()}</div></div>
                <div><span className="text-slate-500">Actual Amount</span><div className="font-bold font-mono text-slate-800 dark:text-slate-200">₱{results.documentHeader.actualAmount.toLocaleString()}</div></div>
              </div>
            </div>
          )}

          {/* Validation Summary */}
          {results.totalExtracted > 0 && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${results.mismatch ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300' : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'}`}>
              {results.mismatch ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              Validation: Expected {results.expectedTotalRecords} records, extracted {results.importedRecords}. {results.mismatch ? 'Count mismatch — review warnings below.' : 'Record count matches document header.'}
            </div>
          )}

          {/* Errors */}
          {results.errors.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/40 p-4 rounded-xl border border-rose-200 dark:border-rose-800">
              <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200 flex items-center gap-2 mb-2"><ShieldAlert className="w-4 h-4" /> Import Errors</h4>
              <ul className="text-xs text-rose-700 dark:text-rose-300 space-y-1 list-disc list-inside">{results.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          {/* Diagnostic Info */}
          {results.diagnostic && results.totalExtracted === 0 && (
            <DiagnosticPanel diagnostic={results.diagnostic} />
          )}

          {/* Warnings */}
          {results.warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> Extraction Notices ({results.warnings.length})</h4>
              <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1 list-disc list-inside max-h-40 overflow-y-auto">{results.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {/* Preview Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
            <PreviewMetric label="Total Extracted" value={results.totalExtracted} color="text-depedblue-600" />
            <PreviewMetric label="New Positions" value={results.newPositions.length} color="text-emerald-600" />
            <PreviewMetric label="Updated" value={results.updatedPositions.length} color="text-blue-600" />
            <PreviewMetric label="Vacant Items" value={results.vacantPositions.length} color="text-rose-600" />
            <PreviewMetric label="Filled Items" value={results.filledPositions.length} color="text-emerald-700" />
            <PreviewMetric label="Duplicates" value={results.duplicatesCount} color="text-amber-600" />
            <PreviewMetric label="Invalid" value={results.invalidCount} color="text-slate-500" />
          </div>

          {/* Extracted Data Preview Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 text-slate-700 dark:text-slate-300 uppercase font-semibold">
                <tr>
                  <th className="p-2.5">Item Number</th><th className="p-2.5">Position Title</th><th className="p-2.5 text-center">SG</th>
                  <th className="p-2.5 text-right">Auth. Salary</th><th className="p-2.5">Incumbent</th><th className="p-2.5">Sex</th><th className="p-2.5">Birth Date</th><th className="p-2.5">Eligibility</th><th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {results.positions.map((pos, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 font-mono font-bold text-slate-800 dark:text-slate-100">{pos.item_number}</td>
                    <td className="p-2.5 font-medium text-slate-900 dark:text-white">{pos.position_title}</td>
                    <td className="p-2.5 text-center font-semibold">{pos.salary_grade}</td>
                    <td className="p-2.5 text-right font-mono text-slate-700 dark:text-slate-300">₱{pos.authorized_salary.toLocaleString()}</td>
                    <td className="p-2.5">{pos.position_status === 'Vacant' ? <span className="text-rose-600 italic">VACANT</span> : pos.employee_name}</td>
                    <td className="p-2.5 text-center">{pos.sex || '—'}</td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">{pos.birth_date || '—'}</td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">{pos.eligibility || '—'}</td>
                    <td className="p-2.5 text-center"><StatusBadge status={pos.position_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: FISCAL YEAR VIEW
// ════════════════════════════════════════════════════════════════════════════
function FiscalYearView({ headers, positions, fiscalYear, setFiscalYear }: {
  headers: PlantillaHeader[]; positions: PlantillaPosition[];
  fiscalYear: number; setFiscalYear: (y: number) => void;
}) {
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    headers.forEach((h) => years.add(h.fiscal_year));
    positions.forEach((p) => { if (p.fiscal_year) years.add(p.fiscal_year); });
    return Array.from(years).sort((a, b) => b - a);
  }, [headers, positions]);

  const yearData = useMemo(() => {
    const yearPositions = positions.filter((p) => p.fiscal_year === fiscalYear);
    const filled = yearPositions.filter((p) => p.position_status === 'Filled').length;
    const vacant = yearPositions.filter((p) => p.position_status === 'Vacant').length;
    const authorized = yearPositions.reduce((acc, p) => acc + (p.authorized_salary || p.annual_salary || 0), 0);
    const actual = yearPositions.filter((p) => p.position_status === 'Filled').reduce((acc, p) => acc + (p.actual_salary || p.annual_salary || 0), 0);
    return { total: yearPositions.length, filled, vacant, authorized, actual, positions: yearPositions };
  }, [positions, fiscalYear]);

  return (
    <div className="space-y-4">
      {/* Year Selector */}
      <div className="enterprise-card p-4 flex items-center gap-4">
        <Calendar className="w-5 h-5 text-depedblue-600" />
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Fiscal Year</label>
          <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} className="input-base !w-auto ml-2 inline-block">
            {availableYears.map((y) => <option key={y} value={y}>FY {y}</option>)}
          </select>
        </div>
      </div>

      {/* Year Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <DashboardKpi label="Total Positions" value={yearData.total.toLocaleString()} icon={Briefcase} color="from-depedblue-600 to-depedblue-800" />
        <DashboardKpi label="Filled" value={yearData.filled.toLocaleString()} icon={UserCheck} color="from-emerald-500 to-emerald-700" />
        <DashboardKpi label="Vacant" value={yearData.vacant.toLocaleString()} icon={UserX} color="from-rose-500 to-rose-700" />
        <DashboardKpi label="Authorized" value={`₱${(yearData.authorized / 1000000).toFixed(1)}M`} icon={DollarSign} color="from-blue-500 to-blue-700" />
        <DashboardKpi label="Actual" value={`₱${(yearData.actual / 1000000).toFixed(1)}M`} icon={DollarSign} color="from-indigo-500 to-indigo-700" />
      </div>

      {/* Year Comparison Table */}
      <div className="enterprise-card p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Historical Plantilla Records & Year Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold uppercase border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Fiscal Year</th><th className="p-3">Division</th><th className="p-3 text-center">Total</th>
                <th className="p-3 text-center">Filled</th><th className="p-3 text-center">Vacant</th><th className="p-3 text-right">Authorized</th><th className="p-3 text-right">Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {headers.map((h) => (
                <tr key={h.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 ${h.fiscal_year === fiscalYear ? 'bg-depedblue-50/40 dark:bg-depedblue-950/20 font-medium' : ''}`}>
                  <td className="p-3 font-bold text-depedblue-700 dark:text-depedblue-300">FY {h.fiscal_year}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{h.division_office}</td>
                  <td className="p-3 text-center font-bold">{h.total_positions}</td>
                  <td className="p-3 text-center font-bold text-emerald-600">{h.filled_positions}</td>
                  <td className="p-3 text-center font-bold text-rose-600">{h.unfilled_positions}</td>
                  <td className="p-3 text-right font-mono">₱{h.authorized_amount.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">₱{h.actual_amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: REPORTS VIEW
// ════════════════════════════════════════════════════════════════════════════
function ReportsView({ positions, onExport, onPrint }: {
  positions: PlantillaPosition[]; onExport: () => void; onPrint: () => void;
}) {
  const reportTypes = [
    { id: 'filled', label: 'Filled Positions Report', icon: UserCheck, desc: 'All positions with active incumbents', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
    { id: 'vacant', label: 'Vacant Positions Report', icon: UserX, desc: 'Unfilled plantilla items open for recruitment', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30' },
    { id: 'salary', label: 'Salary Summary Report', icon: DollarSign, desc: 'Authorized vs actual salary breakdown by grade', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
    { id: 'masterlist', label: 'Employee Master List', icon: Users, desc: 'Complete listing of all personnel with details', color: 'text-depedblue-600 bg-depedblue-50 dark:bg-depedblue-950/30' },
    { id: 'eligibility', label: 'Eligibility Report', icon: Award, desc: 'Civil service eligibility distribution', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
    { id: 'age', label: 'Age Demographics Report', icon: TrendingUp, desc: 'Personnel age distribution analysis', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' },
    { id: 'summary', label: 'Plantilla Summary Report', icon: ClipboardList, desc: 'Comprehensive plantilla overview by category', color: 'text-slate-600 bg-slate-100 dark:bg-slate-800' },
  ];

  return (
    <div className="space-y-4">
      <div className="enterprise-card p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Generate Reports</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Select a report type to generate, export, or print.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reportTypes.map((r) => (
            <div key={r.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-card-hover transition-all space-y-2">
              <div className={`w-9 h-9 rounded-lg ${r.color} flex items-center justify-center`}>
                <r.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{r.label}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{r.desc}</p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <button onClick={onExport} className="btn-ghost !text-[11px] !py-1"><FileDown className="w-3 h-3" /> Export</button>
                <button onClick={onPrint} className="btn-ghost !text-[11px] !py-1"><Printer className="w-3 h-3" /> Print</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: SCHOOL INTEGRATION VIEW
// ════════════════════════════════════════════════════════════════════════════
function SchoolIntegrationView({ positions }: { positions: PlantillaPosition[] }) {
  const [subTab, setSubTab] = useState<SchoolSubTab>('elementary');

  const summaries = useMemo(() => {
    const map = new Map<string, { code: string; name: string; type: SchoolType; authorized: number; filled: number; vacant: number; employees: number }>();
    positions.forEach((p) => {
      const name = p.school_name || 'Division Office';
      const type = p.school_type || 'Elementary';
      if (!map.has(name)) map.set(name, { code: p.school_id || `SCH-${Math.floor(1000 + Math.random() * 9000)}`, name, type, authorized: 0, filled: 0, vacant: 0, employees: 0 });
      const s = map.get(name)!;
      s.authorized++;
      if (p.position_status === 'Filled') { s.filled++; s.employees++; } else { s.vacant++; }
    });
    return Array.from(map.values());
  }, [positions]);

  const filtered = summaries.filter((s) => {
    if (subTab === 'elementary') return s.type === 'Elementary';
    if (subTab === 'highschool') return s.type === 'High School';
    if (subTab === 'units') return s.type === 'Implementing Unit';
    if (subTab === 'division') return s.type === 'Division Office';
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {(['elementary', 'highschool', 'units', 'division'] as SchoolSubTab[]).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${subTab === t ? 'bg-depedblue-700 text-white' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t === 'elementary' ? 'Elementary Schools' : t === 'highschool' ? 'High Schools' : t === 'units' ? 'Implementing Units' : 'Division Office'}
          </button>
        ))}
      </div>
      <div className="enterprise-card overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold uppercase">
            <tr>
              <th className="p-3">School Code</th><th className="p-3">School / Unit Name</th>
              <th className="p-3 text-center">Authorized</th><th className="p-3 text-center text-emerald-600">Filled</th>
              <th className="p-3 text-center text-rose-600">Vacant</th><th className="p-3 text-center">Employees</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">No schools registered under this category.</td></tr>
            ) : filtered.map((s, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-100">{s.code}</td>
                <td className="p-3 font-medium text-slate-900 dark:text-white">{s.name}</td>
                <td className="p-3 text-center font-bold text-slate-800 dark:text-slate-200">{s.authorized}</td>
                <td className="p-3 text-center font-bold text-emerald-600">{s.filled}</td>
                <td className="p-3 text-center font-bold text-rose-600">{s.vacant}</td>
                <td className="p-3 text-center font-bold text-depedblue-600">{s.employees}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT: AUDIT TRAIL VIEW
// ════════════════════════════════════════════════════════════════════════════
function AuditTrailView({ logs }: { logs: PSIPOPAuditLog[] }) {
  return (
    <div className="enterprise-card p-5 space-y-4">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Clock className="w-4 h-4 text-depedblue-600" /> PSIPOP Import Audit Trail
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-semibold">
            <tr>
              <th className="p-3">Imported By</th><th className="p-3">Date</th><th className="p-3">PDF Filename</th>
              <th className="p-3 text-center">Added</th><th className="p-3 text-center">Updated</th>
              <th className="p-3 text-center">Vacated</th><th className="p-3 text-center">Filled</th><th className="p-3 text-center">Total</th><th className="p-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="p-3 font-medium text-slate-900 dark:text-white">{log.imported_by}</td>
                <td className="p-3 text-slate-600 dark:text-slate-400">{log.import_date}</td>
                <td className="p-3 font-mono text-depedblue-600 dark:text-depedblue-400 truncate max-w-[200px]">{log.pdf_filename}</td>
                <td className="p-3 text-center font-bold text-emerald-600">+{log.positions_added}</td>
                <td className="p-3 text-center font-bold text-blue-600">{log.positions_updated}</td>
                <td className="p-3 text-center font-bold text-rose-600">{log.positions_vacated}</td>
                <td className="p-3 text-center font-bold text-emerald-700">{log.positions_filled}</td>
                <td className="p-3 text-center font-bold">{log.total_records}</td>
                <td className="p-3 text-center"><span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{log.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL COMPONENTS
// ════════════════════════════════════════════════════════════════════════════
function EditModal({ editingPosition, formData, setFormData, onClose, onSave }: {
  editingPosition: PlantillaPosition | null;
  formData: Partial<PlantillaPosition>;
  setFormData: (d: Partial<PlantillaPosition>) => void;
  onClose: () => void; onSave: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{editingPosition ? 'Edit Plantilla Position' : 'Create New Plantilla Position'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={onSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput label="Item Number *" required value={formData.item_number || ''} onChange={(v) => setFormData({ ...formData, item_number: v })} mono />
            <FormInput label="Position Title *" required value={formData.position_title || ''} onChange={(v) => setFormData({ ...formData, position_title: v })} />
            <FormInput label="Salary Grade" type="number" value={String(formData.salary_grade || 11)} onChange={(v) => setFormData({ ...formData, salary_grade: Number(v) })} />
            <FormInput label="Salary Step" type="number" value={String(formData.salary_step || 1)} onChange={(v) => setFormData({ ...formData, salary_step: Number(v) })} />
            <FormInput label="Annual Salary (₱)" type="number" value={String(formData.annual_salary || 324000)} onChange={(v) => setFormData({ ...formData, annual_salary: Number(v) })} mono />
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Position Status</label>
              <select value={formData.position_status || 'Filled'} onChange={(e) => setFormData({ ...formData, position_status: e.target.value as PositionStatus })} className="input-base">
                <option value="Filled">Filled</option><option value="Vacant">Vacant</option>
              </select>
            </div>
            <FormInput label="School Assignment" value={formData.school_name || ''} onChange={(v) => setFormData({ ...formData, school_name: v })} />
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">School Type</label>
              <select value={formData.school_type || 'Elementary'} onChange={(e) => setFormData({ ...formData, school_type: e.target.value as SchoolType })} className="input-base">
                <option value="Elementary">Elementary</option><option value="High School">High School</option>
                <option value="Implementing Unit">Implementing Unit</option><option value="Division Office">Division Office</option>
              </select>
            </div>
            {formData.position_status === 'Filled' && (
              <>
                <div className="sm:col-span-2"><FormInput label="Incumbent Employee Name" value={formData.employee_name || ''} onChange={(v) => setFormData({ ...formData, employee_name: v })} /></div>
                <FormInput label="TIN" value={formData.tin || ''} onChange={(v) => setFormData({ ...formData, tin: v })} mono />
                <FormInput label="Eligibility" value={formData.eligibility || ''} onChange={(v) => setFormData({ ...formData, eligibility: v })} />
              </>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Position</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkUpdateModal({ count, onSetFilled, onSetVacant, onDelete, onClose }: {
  count: number; onSetFilled: () => void; onSetVacant: () => void; onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-xl">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Bulk Actions ({count} records)</h3>
        <p className="text-xs text-slate-500">Select an action to apply to all selected positions:</p>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={onSetFilled} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs"><UserCheck className="w-4 h-4 inline mr-1" /> Set FILLED</button>
            <button onClick={onSetVacant} className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs"><UserMinus className="w-4 h-4 inline mr-1" /> Set VACANT</button>
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={onDelete} className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Delete Selected ({count})</button>
          </div>
        </div>
        <button onClick={onClose} className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium">Cancel</button>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ target, bulkCount, onCancel, onConfirm }: {
  target?: PlantillaPosition; bulkCount?: number; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center"><Trash2 className="w-5 h-5" /></div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{bulkCount ? `Delete ${bulkCount} Records` : 'Delete Position'}</h3>
            <p className="text-xs text-slate-500">{bulkCount ? `Are you sure you want to delete all ${bulkCount} selected records?` : 'Are you sure you want to delete this position?'}</p>
          </div>
        </div>
        {target && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200">{target.item_number}</div>
            <div className="text-slate-600 dark:text-slate-400">{target.position_title} (SG {target.salary_grade})</div>
          </div>
        )}
        <p className="text-xs text-rose-600 font-medium">This action cannot be undone.</p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn-danger"><Trash2 className="w-3.5 h-3.5" /> {bulkCount ? `Delete All (${bulkCount})` : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ════════════════════════════════════════════════════════════════════════════
function NavTab({ active, onClick, icon: Icon, label, badge }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number;
}) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${active ? 'bg-depedblue-700 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
      <Icon className="w-4 h-4" />
      {label}
      {badge !== undefined && <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>{badge}</span>}
    </button>
  );
}

function DashboardKpi({ label, value, icon: Icon, color, trend }: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string; trend?: 'up' | 'down';
}) {
  return (
    <div className={`p-4 rounded-2xl bg-gradient-to-br ${color} shadow-sm space-y-2 relative overflow-hidden`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium opacity-90">{label}</span>
        <Icon className="w-4 h-4 opacity-75" />
      </div>
      <div className="text-xl font-extrabold tracking-tight">{value}</div>
      {trend && (
        <div className="text-[10px] opacity-80 flex items-center gap-1">
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trend === 'up' ? 'Active' : 'Open for recruitment'}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PositionStatus }) {
  if (status === 'Filled') return <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Filled</span>;
  return <span className="badge bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">Vacant</span>;
}

function CategoryBadge({ category }: { category: PersonnelCategory }) {
  const styles: Record<PersonnelCategory, string> = {
    'Teaching': 'bg-depedblue-100 text-depedblue-800 dark:bg-depedblue-950 dark:text-depedblue-300 border-depedblue-200 dark:border-depedblue-800',
    'Teaching Related': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    'Non-Teaching': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return <span className={`badge ${styles[category]}`}>{category}</span>;
}

function DetailSection({ title, icon: Icon, children }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-depedblue-700 dark:text-depedblue-300 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
        <Icon className="w-3.5 h-3.5 text-depedblue-600" /> {title}
      </h4>
      <div className="space-y-2 text-xs">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, isBold }: { label: string; value: string; isBold?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-right ${isBold ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-800 dark:text-slate-200'}`}>{value || '—'}</span>
    </div>
  );
}

function FormInput({ label, value, onChange, type = 'text', required, mono }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; mono?: boolean;
}) {
  return (
    <div>
      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className={`input-base ${mono ? 'font-mono' : ''}`} />
    </div>
  );
}

function PreviewMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center border border-slate-200 dark:border-slate-700">
      <div className={`text-base font-extrabold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">{label}</div>
    </div>
  );
}

function DistributionBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold mb-1">
        <span className="text-slate-700 dark:text-slate-300">{label} ({count})</span>
        <span className="text-slate-500">{pct}%</span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
        <div className={`${color} h-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DonutChart({ filled, vacant }: { filled: number; vacant: number }) {
  const total = filled + vacant || 1;
  const filledPct = (filled / total) * 100;
  const circumference = 2 * Math.PI * 40;
  const filledDash = (filledPct / 100) * circumference;

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-rose-200 dark:text-rose-900/50" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-emerald-500" strokeDasharray={`${filledDash} ${circumference}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-slate-900 dark:text-white">{filledPct.toFixed(0)}%</span>
        <span className="text-[10px] text-slate-500">Filled</span>
      </div>
    </div>
  );
}

// ── KPI Data Type ───────────────────────────────────────────────────────────
interface KpiData {
  total: number;
  filled: number;
  vacant: number;
  teaching: number;
  teachingRelated: number;
  nonTeaching: number;
  authorizedSalary: number;
  actualSalary: number;
  utilizationRate: string;
}

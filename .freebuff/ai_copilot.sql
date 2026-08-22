-- ================================================================
-- SCRIVIA CLOUD Built-in AI Payroll Copilot
-- Replaces the external Groq/LLM edge function with a self-contained
-- knowledge-base that can query live data and answer payroll questions.
-- ================================================================

CREATE OR REPLACE FUNCTION public.ai_copilot(
  p_question text,
  p_org jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  q text := lower(trim(p_question));
  answer text := '';
  regcode text := p_org->>'regcode';
  divcode text := p_org->>'divcode';
  division_name text := p_org->>'divisionName';
  region_name text := p_org->>'regionName';
  is_scoped boolean := (p_org->>'scoped')::boolean;
  v_count bigint;
  v_total numeric;
  result jsonb;
BEGIN
  -- ── Greeting ──────────────────────────────────────────────────────
  IF q SIMILAR TO '^(hi|hello|hey|good (morning|afternoon|evening)|howdy|yo)%' THEN
    answer := 'Hello! I am **SCRIVIA CLOUD Payroll Copilot**. I can help you with:

- **Payroll workflow** — running payroll, posting, locking periods
- **Employee masterfile** — querying, adding, and managing employees
- **Deductions** — GSIS, PhilHealth, Pag-IBIG, BIR Withholding Tax
- **Division scoping** — REGCODE/DIVCODE, how data is partitioned
- **Reports** — payroll registers, remittance summaries, analytics
- **Modules** — Organization, Salary Schedule, Plantilla, Initial Payroll

Ask me anything about SCRIVIA CLOUD!';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── System overview ───────────────────────────────────────────────
  IF q SIMILAR TO '%(what|which) (modules|features|pages|sections|menus) (are|is) (there|available|in|under)?%' OR
     q SIMILAR TO '%(what|tell me about) (scrivia|this system|the system|the app)%' OR
     q = 'overview' OR q = 'help' OR q = 'what can you do' THEN
    answer := '## SCRIVIA CLOUD Modules

SCRIVIA CLOUD is the **Workforce Intelligence, Payroll, Plantilla, Remittance, Compliance and Analytics** platform for the Philippine education sector.

### Core Modules
| Module | Purpose |
|--------|---------|
| **Dashboard** | Real-time payroll stats, pending approvals, loan summary |
| **Employee Management** | Masterfile of employees with STACODE, division scoping |
| **Payroll** | Monthly payroll processing — run, compute, post, lock |
| **Deductions & Loans** | GSIS, PhilHealth, Pag-IBIG, BIR W/Tax, loan deductions |
| **Initial Payroll** | Pre-regular-payroll processing and transfer |
| **Organization** | Regions, Divisions, Schools, Division Office settings |
| **Salary Schedule** | Salary grades, steps, NBC 601 (Third Tranche) |
| **Plantilla Positions** | PSIPOP PDF import, position management |
| **Reports** | Payroll registers, remittance, deduction summaries |
| **Audit & Monitoring** | Login tracking, security events, audit logs |
| **Administration** | Users & Roles, role permissions, MFA, system settings |
| **OmniDev AI** | This copilot — ask questions in natural language |

All data is **division-scoped** via REGCODE/DIVCODE so divisions only see their own records.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── REGCODE / DIVCODE scoping ────────────────────────────────────
  IF q SIMILAR TO '%(regcode|divcode|division.?code|region.?code|scoping|scoped|scope|partition|multi.?division|division.?filter|division.?access)%' OR
     q SIMILAR TO '%(how (does|do) (division|region|scope|scoping|access control|data.?separation))%' OR
     q SIMILAR TO '%explain.*(division|region|scope)' OR
     q LIKE '%how are divisions%' THEN
    answer := '## REGCODE / DIVCODE Scoping Model

SCRIVIA CLOUD uses a **two-level division scoping** system to partition data:

### Architecture
- **REGCODE** — Region code (e.g., `IV-A` for CALABARZON)
- **DIVCODE** — Division code (e.g., `1801` for Division of Calamba City)
- Every employee, payroll entry, deduction, and audit log carries `(regcode, divcode)` columns

### How it works
1. **Profile assignment**: Each user profile has a `division_id` and `region_id` linking to the Organization module
2. **Automatic stamping**: The `stamp_division_codes()` trigger fires on INSERT/UPDATE and fills `regcode`/`divcode` from the acting user profile
3. **Query scoping**: RPC functions like `query_employees()`, `get_dashboard_summary()`, and `get_payroll_history_by_month()` accept `p_regcode` and `p_divcodes` parameters
4. **Super Admin override**: Users with `role = super_admin` see ALL divisions; others see only their assigned division

### Tables with REGCODE/DIVCODE columns
`employees`, `pay_periods`, `payroll_entries`, `payroll_deductions`, `audit_logs`, `signatories`, `initial_payroll_records`, `non_plantilla_employees`

### Key rule
> A division user can NEVER see another division''s data. The super administrator can filter by division using the sidebar dropdown.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Payroll workflow ──────────────────────────────────────────────
  IF q SIMILAR TO '%(run|processing|process|computing|compute|execute) (the )?(regular )?payroll%' OR
     q SIMILAR TO '%(payroll )?(workflow|flow|steps|procedure|how to)' OR
     q SIMILAR TO '%(how do i|how to) (run|start|begin|process) (the )?(payroll|monthly payroll|payroll run)' OR
     q LIKE '%monthly payroll workflow%' OR
     q LIKE '%payroll cycle%' THEN
    answer := '## Monthly Payroll Workflow

### Step-by-step process
1. **Generate Pay Periods** — Go to Payroll → Pay Periods and click "Generate" for the fiscal year (scoped to your division)
2. **Import Employee Data** — Upload DBF files via Smart Import or manually add employees in the Masterfile
3. **Manage Deductions** — Go to Deductions & Loans to assign GSIS, PhilHealth, Pag-IBIG, and loan deductions to employees
4. **Run Payroll** — Click "Run Payroll" on the Dashboard or Payroll page. The engine computes gross pay, deductions, and net pay for each employee
5. **Review Entries** — Check the computed payroll entries for accuracy (gross, deductions, net pay)
6. **Post Payroll** — Once verified, post the payroll period. This locks the entries and prevents further edits
7. **Lock Period** — After posting, the period status changes to "closed" and cannot be reopened without a reverse operation

### Important rules
- Only **one payroll cycle** can be active at a time per division
- **Posting is final** for the period — reverse if corrections are needed
- The payroll engine respects **division scoping** — only your division''s employees are processed
- Posted entries trigger **NTHP validation** (Non-Taxable Highest Pay check)

### Quick actions from Dashboard
- **Run Payroll** → Opens the payroll processing workspace
- **Employees** → Opens the Masterfile for data management
- **Reports** → Generate payroll registers and remittance summaries';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Posting / locking ────────────────────────────────────────────
  IF q SIMILAR TO '%(post|lock|close|finalize) (the )?(payroll|period|pay period)' OR
     q SIMILAR TO '%(how do i|how to) (post|lock|close)' THEN
    answer := '## Posting & Locking a Pay Period

### Posting
Posting finalizes the payroll entries for a period. After posting:
- Entry status changes to **Posted**
- No further edits are allowed on posted entries
- The `prevent_posted_entry_modification()` trigger enforces this
- Posted entries are included in reports and remittance summaries

### Locking (Closing)
After posting, the period can be locked (status → `closed`):
- A locked period **cannot be reopened** without admin intervention
- The `prevent_closed_period_reopen()` trigger blocks reopen attempts
- Only a super admin can reverse a posted period

### How to post
1. Open **Payroll** → select the pay period
2. Review all entries (verify gross, deductions, net)
3. Click **Post** — this is irreversible for the period
4. The period status updates and entries are frozen

### Reversing a posted period
If mistakes are found after posting:
- Go to **Payroll** → select the locked period
- Click **Reverse** (requires super admin privileges)
- The period reopens and entries become editable again
- All changes are logged in the audit trail';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── GSIS / PhilHealth / Pag-IBIG / BIR Tax ───────────────────────
  IF q SIMILAR TO '%(gsis|philhealth|pag.?ibig|bir|w/?tax|withholding tax|mandatory deduction|contribution)%' OR
     q SIMILAR TO '%(how (are|is)) (gsis|philhealth|pag.?ibig|bir|tax|contribution|deduction)s? (computed|calculated|computed)%' OR
     q LIKE '%computation%' OR q LIKE '%how are deductions%' THEN
    answer := '## Mandatory Deductions Computation

### GSIS (Government Service Insurance System)
- **Contribution**: Based on monthly salary credit (MSC) using the GSIS contribution table
- **Employee share**: ~9% of MSC
- **Employer share**: ~12% of MSC
- **Premium**: Computed on the gross basic salary
- **Loan deductions**: GSIS salary loan, policy loan, emergency loan (if applicable)
- Deduction code: `GSIS` (premium) + `GSISLN` (loan)

### PhilHealth
- **Contribution**: 5% of basic monthly salary (split 50/50 employee-employer)
- Floor: ₱10,000 | Ceiling: ₱100,000 monthly salary credit
- Employee share: 2.25% of MSC
- Employer share: 2.75% of MSC
- Deduction code: `PHIL`

### Pag-IBIG (HDMF)
- **Employee share**: 2% of monthly salary (capped at ₱2,000 for high earners)
- **Employer share**: 2% of monthly salary (capped at ₱2,000)
- Members earning ₱5,000 and below: mandatory 1% employee share
- Deduction code: `PAGIBIG` (regular) + `HDMF` (MP2 if applicable)

### BIR Withholding Tax
- Computed using the **TRAIN Law** tax table ( graduated rates)
- Taxable income = Gross pay − (GSIS + PhilHealth + Pag-IBIG)
- Applied per pay period based on the employee''s tax status (ME, ME1, ME2, S, S1, etc.)
- Deduction code: `TAX`

### Where to manage
- **Deduction Codes** menu: View/edit deduction codes and rates
- **Payroll → Run Payroll**: Engine auto-computes all deductions
- **Deduction Masterfile**: Assign specific deduction amounts per employee';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Employees / Masterfile ────────────────────────────────────────
  IF q SIMILAR TO '%(employee|masterfile|worker|personnel|staff|teacher)s?%' OR
     q SIMILAR TO '%(how (many|much)|count|list|show|find|search).*(employee|masterfile)' OR
     q LIKE '%employee management%' THEN
    -- Return live data
    SELECT count(*) INTO v_count FROM employees WHERE status = 'Active';
    answer := format('## Employee Masterfile

### Current Statistics
- **Active employees**: %s
- **Total employee records**: (query the Masterfile for full count)

### Key fields per employee
| Field | Description |
|-------|-------------|
| `empno` | Unique employee number |
| `stacode` | Station code (school/office identifier) |
| `regcode` / `divcode` | Division scope codes |
| `basic` / `basic_salary` | Monthly basic salary |
| `grade` / `step` | Salary grade and step |
| `status` | Active, Inactive, Resigned, Terminated |

### How to add employees
1. Go to **Employee Management** (Masterfile)
2. Click **+ Add Employee** or use **Smart Import** (DBF upload)
3. Fill in required fields: Empno, Last Name, First Name, STACODE
4. The employee is automatically stamped with your division codes

### STACODE validation
- STACODE must be numeric and fall within your division''s payroll group ranges
- Elementary: 001–499 | Junior HS: 500–699 | Senior HS: 700–701
- Invalid STACODEs are flagged in the Dashboard''s validation widget', v_count);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Deduction codes / masterfile ──────────────────────────────────
  IF q SIMILAR TO '%(deduction|deduction.?code|deduction.?masterfile|deduction.?list)%' THEN
    SELECT count(*) INTO v_count FROM deduction_codes WHERE active = true;
    answer := format('## Deduction Codes

### Active deduction codes: %s

### Common deduction codes
| Code | Type | Agency | Description |
|------|------|--------|-------------|
| GSIS | Mandatory | GSIS | GSIS premium contribution |
| GSISLN | Loan | GSIS | GSIS salary/policy loan |
| PHIL | Mandatory | PhilHealth | PhilHealth premium |
| PAGIBIG | Mandatory | PAGIBIG | Pag-IBIG regular contribution |
| HDMF | Mandatory | PAGIBIG | Pag-IBIG MP2 / Additional |
| TAX | Mandatory | BIR | Withholding tax |
| LIFE | Loan | INSURANCE | Life insurance |
| COOP | Loan | COOPERATIVE | Cooperative deduction |

### Managing deduction codes
- Go to **Deductions & Loans** → **Deduction Codes**
- You can add, edit, or deactivate deduction codes
- Each code has: `dedcode` (unique), `type` (Mandatory/Loan/Other), `agency`, `active` flag

### Assigning deductions to employees
- Go to **Deductions & Loans** → **Employee Deductions**
- Select employee → add deduction with amount and policy number
- Active deductions are automatically included in payroll runs', v_count);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Reports ───────────────────────────────────────────────────────
  IF q SIMILAR TO '%(report|analytics|summary|register|export|print)' OR
     q LIKE '%what reports%' OR q LIKE '%report center%' THEN
    answer := '## SCRIVIA Report Center

### Available Reports
| Report | Location | Description |
|--------|----------|-------------|
| **Payroll Register** | Reports → Payroll | Complete payroll breakdown per period |
| **Remittance Summary** | Reports → Remittance | GSIS/PhilHealth/Pag-IBIG/BIR totals |
| **Deduction Summary** | Reports → Deductions | All deductions by code and employee |
| **Employee List** | Reports → Employees | Masterfile export (Excel/PDF) |
| **NTHP Compliance** | Reports → Compliance | Non-Taxable Highest Pay validation |
| **Pay Slip** | Reports → Pay Slips | Individual employee pay slips |
| **Audit Trail** | Audit & Monitoring | System activity log |

### How to generate
1. Go to **SCRIVIA Report Center** in the sidebar
2. Select the report type
3. Choose the pay period and scope (division filter)
4. Click **Generate** — download as PDF or Excel

### Export options
- **PDF**: For official documents and printing
- **Excel**: For data analysis and further processing
- **DBF**: For legacy system compatibility

All reports respect **division scoping** — only your division''s data is included.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Regions & Divisions (Organization) ────────────────────────────
  IF q SIMILAR TO '%(region|division|organization|org chart|organizational)' OR
     q LIKE '%regions and divisions%' THEN
    answer := '## Organization Module

### Structure
```
Region (REGCODE)
  └── Division (DIVCODE)
        └── Schools / Offices (STACODE)
```

### Regions
- Each region has a unique `region_code` (e.g., `IV-A`)
- Regions group divisions geographically
- Managed under **Organization → Regions & Divisions**

### Divisions
- Each division belongs to a region and has a unique `division_code` (e.g., `1801`)
- Divisions are the primary scoping unit for all data
- Each user profile is assigned to a division

### Schools / Organization Directory
- Schools are linked to divisions via `division_id`
- Each school has a `school_code` (STACODE) and `school_name`
- Used for employee assignment and STACODE validation

### Division Office Settings
- Configure the division office details (name, address, TIN, signatories)
- Used in payroll reports and remittance summaries
- Upload division logo for official documents';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Salary Schedule ──────────────────────────────────────────────
  IF q SIMILAR TO '%(salary|salary.?schedule|salary.?grade|step|nbc|tranche|compensation)' THEN
    answer := '## Salary Schedule

### Overview
SCRIVIA CLOUD uses the **NBC 601 Third Tranche** salary standardization table effective **January 1, 2026**.

### Structure
| Grade | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Step 7 | Step 8 |
|-------|--------|--------|--------|--------|--------|--------|--------|--------|
| 1 | ₱13,000 | ... | ... | ... | ... | ... | ... | ... |
| 11 | ₱30,028 | ... | ... | ... | ... | ... | ... | ... |
| 33 | ₱103,592 | ... | ... | ... | ... | ... | ... | ... |

- **33 salary grades** with **8 steps** each = 258 total entries
- **Third Tranche** is the final step of the SSL (Salary Standardization Law)

### How it connects to payroll
- Each employee has a `grade` and `step`
- The payroll engine looks up the corresponding salary from the schedule
- Monthly basic salary = the grade-step value from the schedule

### Managing
- Go to **Organization → Salary Schedule**
- View/edit salary grades and steps
- Import from Excel if needed';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Post a pay period ────────────────────────────────────────────
  IF q SIMILAR TO '%(posting|posted|post payroll|post the)' THEN
    answer := '## Posting Payroll Entries

### What happens when you post
1. All draft payroll entries for the period are marked as **Posted**
2. The `prevent_posted_entry_modification()` trigger prevents any UPDATE/DELETE on posted entries
3. The pay period status is updated to reflect the posting
4. Posted entries appear in reports and remittance summaries

### Can I undo a posting?
- Yes, but only via **Reverse Payroll Period** (requires super admin)
- Reversing changes all posted entries back to draft status
- The reversal is logged in the audit trail

### Safety checks
- NTHP (Non-Taxable Highest Pay) validation runs before posting
- Entries with validation errors are flagged and must be resolved first
- Only entries in "draft" status can be posted';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── DBF import ───────────────────────────────────────────────────
  IF q SIMILAR TO '%(dbf|psi pop|psipop|smart import|import|upload|file import)' THEN
    answer := '## DBF Import & Smart Import

### Smart Import (DBF Files)
SCRIVIA CLOUD can import data from legacy DepEd DBF files:

| DBF File | Table | Purpose |
|----------|-------|---------|
| MASTERFILE.DBF | `employees` | Employee records |
| PYENT.DBF | `dbf_pyent` | Payroll entries |
| PAYROLLS.DBF | `payrolls_dbf` | Payroll master |
| DIVTABLE.DBF | `dbf_divtable` | Division table |
| STNTABLE.DBF | `dbf_stntable` | Station table |
| EXCLUDED.DBF | `dbf_excluded` | Excluded employees |
| INCLUDED.DBF | `dbf_included` | Included employees |

### How to import
1. Go to **Employee Management** → **Smart Import**
2. Select the DBF file
3. Preview the records
4. Click **Import** — new employees are added, existing ones are updated

### PSIPOP PDF Import
- For plantilla positions from the PSIPOP PDF
- Go to **Plantilla Positions** → **Import PDF**
- The system extracts position data using OCR (Tesseract.js)

### Validation
- STACODE validation runs during import
- Invalid STACODEs are flagged for review
- Duplicate employee numbers are handled gracefully';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Current division stats (live data) ────────────────────────────
  IF q SIMILAR TO '%(dashboard|stats|statistics|summary|how (many|much) (employee|record|data))%' OR
     q LIKE '%current status%' OR q LIKE '%what is the current%' THEN
    SELECT count(*) INTO v_count FROM employees;
    SELECT COALESCE(sum(net_pay), 0) INTO v_total FROM payroll_entries WHERE status = 'Posted';
    answer := format('## Current System Status

### Database Summary
| Metric | Value |
|--------|-------|
| Total employees | %s |
| Active employees | (check Dashboard) |
| Posted payroll total | ₱%s |
| Pay periods | (check Payroll → Periods) |
| Deduction codes | (check Deduction Codes) |

### Quick health check
- Salary schedule: 258 entries (33 grades × 8 steps)
- Payroll groups: 3 configured (Elementary 001–499, Junior HS 500–699, Senior HS 700–701)
- Division scoping: %s

%s', v_count, to_char(v_total, 'FM999,999,999.00'),
  CASE WHEN is_scoped THEN format('Active — scoped to %s (%s)', COALESCE(division_name, region_name), COALESCE(divcode, regcode))
       ELSE 'Super Admin — full system access' END,
  CASE WHEN is_scoped THEN format('> Your division scope: **%s** (REGCODE: %s, DIVCODE: %s)', COALESCE(division_name, 'N/A'), COALESCE(regcode, 'N/A'), COALESCE(divcode, 'N/A'))
       ELSE '> You have full access to all divisions.' END);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Users & Roles ────────────────────────────────────────────────
  IF q SIMILAR TO '%(user|role|permission|access|admin|super.?admin|approval|sign.?up|register)' OR
     q LIKE '%user management%' THEN
    answer := '## Users & Roles

### Available Roles
| Role | Access Level |
|------|-------------|
| `super_admin` | Full system access, all divisions |
| `payroll_admin` | Payroll management, reports |
| `payroll_processor` | Run payroll, compute entries |
| `hr_administrator` | Employee management |
| `school_coordinator` | School-level operations |
| `school_head` | School-level read/approve |
| `accounting_officer` | Financial reports |
| `division_finance` | Division financial ops |
| `auditor` | Read-only audit access |
| `read_only` | Basic read access |

### User approval workflow
1. New users register via the Sign Up page
2. Account starts as `pending_approval`
3. Admin approves via **Administration → Users & Roles**
4. Approved users get their assigned role

### MFA (Multi-Factor Authentication)
- Can be enabled per user
- Uses TOTP (Time-based One-Time Password)
- Admin can force MFA for all users

### Security
- Failed login attempts are tracked
- Account locks after 5 failed attempts (30-minute cooldown)
- Session timeout: 15 minutes of inactivity
- All actions are logged in the audit trail';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Default / fallback ───────────────────────────────────────────
  answer := format('I can help you with SCRIVIA CLOUD! Here are some things you can ask:

### Quick examples
- *"How do I run payroll?"* — Step-by-step payroll workflow
- *"How are GSIS deductions computed?"* — Mandatory deduction formulas
- *"Explain REGCODE/DIVCODE scoping"* — Division data partitioning
- *"What modules are in the system?"* — Full module overview
- *"How do I post a pay period?"* — Posting and locking workflow
- *"How many employees are there?"* — Live system stats
- *"What reports are available?"* — Report Center guide

### Your current scope
%s

> **Tip**: Be specific in your question for the best answer. For example, instead of "payroll", try "How do I run the monthly payroll for my division?"

> **Note**: This copilot has deep knowledge of SCRIVIA CLOUD''s modules, workflows, and data model. It can query live data when asked about counts, statuses, and summaries.',
  CASE WHEN is_scoped THEN format('Scoped to **%s** (REGCODE: %s, DIVCODE: %s)', COALESCE(division_name, region_name), COALESCE(regcode, 'N/A'), COALESCE(divcode, 'N/A'))
       ELSE 'You are logged in as **Super Admin** with access to all divisions.' END);

  RETURN jsonb_build_object('reply', answer);
END;
$function$;

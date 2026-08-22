# SCRIVIA CLOUD™ Enterprise

**Smart Payroll. Secure Future.** · Payroll • People • Precision · *From Records to Intelligence*

SCRIVIA CLOUD™ is built upon the historical foundation of workforce administration —
payroll registers, employee records, ledgers, journals, official documentation,
signatures, and certifications. The platform transforms traditional paper-based
personnel administration into an intelligent, cloud-native workforce ecosystem
for the Philippine education sector.

It preserves 100% compatibility with existing payroll formulas, CSC rules,
remittance calculations, plantilla structures, approval workflows, reports,
imports, exports, and compliance processes.

> **Brand identity** — *SCRIVIA* is derived from the concept of writing, records,
> documentation, and official payroll registers. It symbolizes the evolution from
> paper records to enterprise intelligence.

## Product

| Area | Description |
| --- | --- |
| Payroll | Regular, initial, special payroll with full DepEd computation (GSIS, PhilHealth, Pag-IBIG, BIR, PERA) |
| Plantilla | Plantilla positions, non-plantilla items, salary schedule (NBC 601) |
| Imports/Exports | Smart Import, DBF Import/Export center (10 FoxPro tables), PSIPOP Excel reports |
| Deductions & Loans | Deduction engine, masterfile, loan billing (PLI), remittances |
| Intelligence | AI Command Center — payroll exception scanning with confidence scores |
| Administration | Role-based dashboards, DB-backed permission matrix, regions & divisions, audit trail |

## Setup & Environment

SCRIVIA CLOUD runs on **React + Vite + TypeScript** with **Supabase** (PostgreSQL,
Auth, RLS, RPC functions) as the backend. No other server is required.

### 1. Environment keys

Add these two keys (Supabase Dashboard → **Project Settings → API**) — e.g. in a
`.env.local` file or the Freebuff Keys tab:

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, e.g. `https://xxxxxxxxxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public **anon** key (RLS-gated client key) |

> ⚠️ The `VITE_` prefix is required so Vite exposes the values to the browser.
> Never add the **service_role** key to the client — it would be exposed in the
> public bundle. The app will fail fast with a clear message if the keys are missing.

### 2. Database migrations

Apply the SQL migrations in `supabase/migrations/` (in order) to your project:

```bash
supabase db push
```

or paste each file's contents into Supabase → **SQL Editor** → Run. The
migrations create the schema, RLS policies, audit triggers, and the RPC
functions the app calls (including the email-verification sync and the
regions/divisions self-healing functions).

### 3. Auth email delivery

Supabase's default `no-reply@supabase.co` mail is frequently throttled/filtered.
If verification or reset emails don't arrive, configure **custom SMTP** under
Supabase → **Authentication → SMTP Settings**.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-dxztsivp)

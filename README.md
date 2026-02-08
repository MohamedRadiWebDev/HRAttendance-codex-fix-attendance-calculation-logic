# HR Attendance & Payroll System (نظام الحضور والانصراف والرواتب)

A comprehensive, production-ready HR management system tailored for Arabic-speaking organizations. The system handles biometric attendance data processing, payroll calculations, and advanced rule-based policy enforcement with a full RTL (Right-to-Left) interface.

## 🚀 Features

- **Employee Management**: Comprehensive records with Arabic support, sector-wise categorization, and shift assignments.
- **Biometric Integration**: Import raw punch data from Excel files with flexible column mapping.
- **Attendance Engine**: Automated processing of daily records including:
  - Late arrival and early departure detection.
  - Missing stamp identification (سهو بصمة).
  - Overtime calculation (including overnight stays).
  - Friday and holiday management.
- **Rule Engine**: Priority-based special rules for custom shifts, exemptions, and penalty overrides.
- **Adjustments & Leaves**: Management of missions (مأموريات), permissions (أذونات), and half-day leaves.
- **Excel Workflow**: Customizable templates for importing attendance and exporting detailed/summary reports.
- **RTL Dashboard**: Real-time analytics and statistics in Arabic.

## 📱 Screens & Pages

- **Dashboard (الرئيسية)**: Overview of attendance stats, employee counts, and daily activity.
- **Employees (الموظفين)**: Master data management for all staff.
- **Attendance (الحضور والانصراف)**: The core processing area where raw data becomes actionable records.
- **Import (الاستيراد)**: Wizard for uploading biometric Excel files using templates.
- **Adjustments (التسويات)**: Logging specific time-based events like missions or short permissions.
- **Leaves (الإجازات)**: Calendar-based management of official and personal leaves.
- **Rules (القواعد الخاصة)**: Configuration of exceptions and specific shift timings.

## ⚖️ Business Rules Summary

| Term (Arabic) | Logic / Calculation |
| :--- | :--- |
| **الحضور (Check-in)** | Earliest valid punch within the arrival window. |
| **الانصراف (Check-out)** | Latest valid punch before or after shift end. |
| **تأخير (Late)** | Computed after a grace period from the assigned `shift_start`. |
| **انصراف مبكر (Early Leave)** | Triggered if checkout is before `shift_end` (usually 0.5 day penalty). |
| **سهو بصمة (Missing Stamp)** | Single punch detected without a corresponding entry/exit. |
| **مبيت (Overnight)** | Detected if checkout occurs after midnight (processed in previous day). |
| **مأمورية (Mission)** | Suppresses standard penalties; counts as worked time. |

## 🔄 Data Flow & Workflow A→Z

1.  **Setup**: Define Employees and Excel Templates (mapping columns like `كود` and `التاريخ_والوقت`).
2.  **Import**: Upload raw biometric Excel file. Data is stored in `biometric_punches`.
3.  **Adjust**: (Optional) Add missions or permissions for specific employees.
4.  **Process**: Run "Attendance Processing". The engine scans punches, applies rules, and generates `attendance_records`.
5.  **Report**: Export results to Excel (Detail or Summary format).

## 🏗️ Architecture (Frontend-Only)

```ascii
+------------------------------+
|          Frontend            |
|       (React + Vite)         |
|  - In-memory attendance      |
|  - Excel import/export       |
|  - Offline-capable           |
+------------------------------+
```

## 📁 Folder Structure

- `client/` - React frontend application.
  - `src/pages/` - Individual application screens.
  - `src/components/` - Reusable UI components (Shadcn).
  - `src/engine/` - Pure attendance rule engine.
  - `src/store/` - In-memory state (employees, punches, rules, records).
  - `src/importers/` - Excel import helpers.
  - `src/exporters/` - Excel export helpers (detail + summary).
- `shared/` - Shared TypeScript types and Zod schemas.
  - `schema.ts` - Data contracts used in the frontend.

## 🗄️ Storage

All data is processed in-memory in the browser. No database or backend is required.

## 💻 Local Development

1.  **Prerequisites**: Node.js 20+.
2.  **Setup**:
    ```bash
    npm install
    ```
3.  **Run**:
    ```bash
    npm run dev
    ```

## 🚀 Deploy to Vercel (Frontend-only)

1.  Push the repository to GitHub.
2.  In Vercel, click **New Project** and import the repo.
3.  Root Directory: **/** (repo root).
4.  Framework preset: **Vite**.
5.  Build Command: `npm run build`
6.  Output Directory: `dist/public`
7.  Deploy.

To enable SPA routing on refresh, the repo includes a `vercel.json` rewrite rule and explicit build/output settings that match `vite.config.ts`.

## 🛠️ Troubleshooting

- **Excel date parsing**: Ensure the `History` columns in Excel are formatted as `Date/Time` or `Text` according to the template mapping.
- **Missing Punches**: Check if the employee code in the biometric file matches the `code` field in the Employee table exactly.

## 📜 License
Internal Enterprise License. Contact HR for details.

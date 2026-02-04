# HR Attendance & Payroll System

## Overview

This is an HR Attendance and Payroll Management System built for Arabic-speaking organizations. The application provides comprehensive employee management, biometric attendance tracking, Excel-based data import/export, configurable attendance rules, and leave/adjustment management. The entire UI is designed with RTL (Right-to-Left) layout support for Arabic language users.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state, with custom hooks for data fetching
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with RTL support, custom Arabic fonts (Cairo, Tajawal)
- **Charts**: Recharts for dashboard analytics
- **Excel Processing**: xlsx library for client-side Excel file parsing

### Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **API Pattern**: RESTful API with typed routes defined in shared/routes.ts
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Validation**: Zod schemas shared between client and server via drizzle-zod integration
- **Build System**: Vite for frontend, esbuild for server bundling

### Data Storage
- **Database**: PostgreSQL (required, configured via DATABASE_URL environment variable)
- **Schema Location**: shared/schema.ts contains all table definitions
- **Key Tables**:
  - `employees`: Employee master data with Arabic names, department, shift info
  - `biometricPunches`: Raw biometric attendance stamps
  - `attendanceRecords`: Processed daily attendance with hours, penalties, overtime
  - `excelTemplates`: Configurable Excel import/export column mappings
  - `specialRules`: Priority-based attendance rules (custom shifts, exemptions)
  - `adjustments`: Leave records, missions, permissions

### Shared Code Pattern
- TypeScript interfaces and Zod schemas are defined in the `shared/` directory
- Both client and server import from shared modules for type safety
- API route definitions in shared/routes.ts ensure consistent typing across the stack

### Key Design Decisions
1. **RTL-First Design**: The entire application uses Arabic as the primary language with RTL layout baked into the CSS base
2. **Template-Based Excel Processing**: Flexible column mapping system allows different Excel formats for attendance data import
3. **Rule Priority System**: Special rules have priority levels and scopes (all employees, department-specific, individual) for flexible attendance policy configuration
4. **Typed API Layer**: Route definitions include input/output Zod schemas for end-to-end type safety

## External Dependencies

### Database
- PostgreSQL (required) - Connection via DATABASE_URL environment variable
- Drizzle Kit for migrations (`npm run db:push`)

### Third-Party Libraries
- **xlsx**: Excel file reading/writing for import/export functionality
- **date-fns**: Date manipulation for attendance calculations
- **connect-pg-simple**: PostgreSQL session storage (if sessions are implemented)

### UI Component Dependencies
- Radix UI primitives (dialogs, dropdowns, forms, etc.)
- Recharts for data visualization
- Lucide React for icons
- Embla Carousel for carousel components

### Development Tools
- Vite with React plugin for frontend development
- Replit-specific plugins for development experience (cartographer, dev-banner, error overlay)
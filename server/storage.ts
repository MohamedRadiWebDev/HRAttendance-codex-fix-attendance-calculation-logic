import { 
  employees, type Employee, type InsertEmployee,
  biometricPunches, type BiometricPunch, type InsertBiometricPunch,
  excelTemplates, type Template, type InsertTemplate,
  specialRules, type SpecialRule, type InsertSpecialRule,
  adjustments, type Adjustment, type InsertAdjustment,
  attendanceRecords, type AttendanceRecord, type InsertAttendanceRecord
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, inArray, sql, desc } from "drizzle-orm";

const splitNotes = (notes?: string | null) =>
  (notes || "")
    .split(/[،,]/)
    .map((note) => note.trim())
    .filter(Boolean);

const mergeNotes = (existing?: string | null, next?: string | null) => {
  const noteSet = new Set([...splitNotes(existing), ...splitNotes(next)]);
  return Array.from(noteSet).join("، ");
};

export interface IStorage {
  // Employees
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  getEmployeeByCode(code: string): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee>;

  // Templates
  getTemplates(): Promise<Template[]>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  deleteTemplate(id: number): Promise<void>;

  // Rules
  getRules(): Promise<SpecialRule[]>;
  createRule(rule: InsertSpecialRule): Promise<SpecialRule>;
  updateRule(id: number, rule: Partial<InsertSpecialRule>): Promise<SpecialRule>;
  deleteRule(id: number): Promise<void>;

  // Adjustments
  getAdjustments(filters?: { startDate?: string; endDate?: string; employeeCode?: string; type?: string }): Promise<Adjustment[]>;
  createAdjustment(adjustment: InsertAdjustment): Promise<Adjustment>;
  createAdjustmentsBulk(adjustments: InsertAdjustment[]): Promise<Adjustment[]>;

  // Punches
  createPunch(punch: InsertBiometricPunch): Promise<BiometricPunch>;
  getPunches(startDate: Date, endDate: Date, employeeCode?: string): Promise<BiometricPunch[]>;

  // Attendance
  getAttendance(startDate: string, endDate: string, employeeCode?: string, limit?: number, offset?: number): Promise<{ data: AttendanceRecord[], total: number }>;
  createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord>;
  updateAttendanceRecord(id: number, record: Partial<InsertAttendanceRecord>): Promise<AttendanceRecord>;
  getAttendanceRecord(employeeCode: string, date: string): Promise<AttendanceRecord | undefined>;
  
  // Bulk operations for import
  createEmployeesBulk(employees: InsertEmployee[]): Promise<Employee[]>;
  createPunchesBulk(punches: InsertBiometricPunch[]): Promise<BiometricPunch[]>;

  // Maintenance
  wipeAllData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async wipeAllData(): Promise<void> {
    await db.delete(attendanceRecords);
    await db.delete(adjustments);
    await db.delete(specialRules);
    await db.delete(biometricPunches);
    await db.delete(employees);
    await db.delete(excelTemplates);
  }

  // Employees
  async getEmployees(): Promise<Employee[]> {
    return await db.select().from(employees);
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.id, id));
    return employee;
  }

  async getEmployeeByCode(code: string): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.code, code));
    return employee;
  }

  async createEmployee(insertEmployee: InsertEmployee): Promise<Employee> {
    const [employee] = await db.insert(employees).values(insertEmployee).returning();
    return employee;
  }

  async updateEmployee(id: number, update: Partial<InsertEmployee>): Promise<Employee> {
    const [employee] = await db.update(employees).set(update).where(eq(employees.id, id)).returning();
    return employee;
  }

  // Templates
  async getTemplates(): Promise<Template[]> {
    return await db.select().from(excelTemplates);
  }

  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(excelTemplates).values(insertTemplate).returning();
    return template;
  }

  async deleteTemplate(id: number): Promise<void> {
    await db.delete(excelTemplates).where(eq(excelTemplates.id, id));
  }

  // Rules
  async getRules(): Promise<SpecialRule[]> {
    return await db.select().from(specialRules);
  }

  async createRule(insertRule: InsertSpecialRule): Promise<SpecialRule> {
    const [rule] = await db.insert(specialRules).values(insertRule).returning();
    return rule;
  }

  async updateRule(id: number, update: Partial<InsertSpecialRule>): Promise<SpecialRule> {
    const [rule] = await db.update(specialRules).set(update).where(eq(specialRules.id, id)).returning();
    return rule;
  }

  async deleteRule(id: number): Promise<void> {
    await db.delete(specialRules).where(eq(specialRules.id, id));
  }

  // Adjustments
  async getAdjustments(filters?: { startDate?: string; endDate?: string; employeeCode?: string; type?: string }): Promise<Adjustment[]> {
    if (!filters) {
      return await db.select().from(adjustments);
    }

    const conditions = [];
    if (filters.startDate) conditions.push(gte(adjustments.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(adjustments.date, filters.endDate));
    if (filters.employeeCode) {
      conditions.push(eq(adjustments.employeeCode, filters.employeeCode));
    }
    if (filters.type) {
      conditions.push(eq(adjustments.type, filters.type));
    }

    if (conditions.length === 0) {
      return await db.select().from(adjustments);
    }

    return await db.select().from(adjustments).where(and(...conditions));
  }

  async createAdjustment(insertAdjustment: InsertAdjustment): Promise<Adjustment> {
    const [adj] = await db.insert(adjustments)
      .values(insertAdjustment)
      .onConflictDoUpdate({
        target: [
          adjustments.employeeCode,
          adjustments.date,
          adjustments.type,
          adjustments.fromTime,
          adjustments.toTime,
          adjustments.source,
        ],
        set: {
          note: insertAdjustment.note ?? null,
          sourceFileName: insertAdjustment.sourceFileName ?? null,
          importedAt: insertAdjustment.importedAt ?? new Date(),
        },
      })
      .returning();
    return adj;
  }

  async createAdjustmentsBulk(insertAdjustments: InsertAdjustment[]): Promise<Adjustment[]> {
    if (insertAdjustments.length === 0) return [];
    return await db.insert(adjustments)
      .values(insertAdjustments)
      .onConflictDoUpdate({
        target: [
          adjustments.employeeCode,
          adjustments.date,
          adjustments.type,
          adjustments.fromTime,
          adjustments.toTime,
          adjustments.source,
        ],
        set: {
          note: sql`excluded.note`,
          sourceFileName: sql`excluded.source_file_name`,
          importedAt: sql`excluded.imported_at`,
        },
      })
      .returning();
  }

  // Punches
  async createPunch(insertPunch: InsertBiometricPunch): Promise<BiometricPunch> {
    const [punch] = await db.insert(biometricPunches).values(insertPunch).returning();
    return punch;
  }

  async getPunches(startDate: Date, endDate: Date, employeeCode?: string): Promise<BiometricPunch[]> {
    let query = db.select().from(biometricPunches).where(
      and(
        gte(biometricPunches.punchDatetime, startDate),
        lte(biometricPunches.punchDatetime, endDate)
      )
    );
    
    if (employeeCode) {
      query = db.select().from(biometricPunches).where(
        and(
          gte(biometricPunches.punchDatetime, startDate),
          lte(biometricPunches.punchDatetime, endDate),
          eq(biometricPunches.employeeCode, employeeCode)
        )
      );
    }
    
    return await query;
  }

  // Attendance
  async getAttendance(startDate: string, endDate: string, employeeCode?: string, limit: number = 0, offset: number = 0): Promise<{ data: AttendanceRecord[], total: number }> {
    let conditions = [gte(attendanceRecords.date, startDate), lte(attendanceRecords.date, endDate)];
    if (employeeCode) {
      if (employeeCode.includes(',')) {
        const codes = employeeCode.split(',').map(c => c.trim()).filter(c => c !== "");
        if (codes.length > 0) {
          conditions.push(inArray(attendanceRecords.employeeCode, codes));
        }
      } else {
        conditions.push(eq(attendanceRecords.employeeCode, employeeCode.trim()));
      }
    }
    
    const [countResult] = await db.select({ 
      count: sql<number>`count(*)` 
    }).from(attendanceRecords).where(and(...conditions));

    let dataQuery = db.select()
      .from(attendanceRecords)
      .where(and(...conditions))
      .orderBy(desc(attendanceRecords.date), desc(attendanceRecords.id));
    
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 0;
    const safeOffset = safeLimit > 0 && Number.isFinite(offset) && offset > 0 ? offset : 0;

    const data = safeLimit > 0 
      ? await dataQuery.limit(safeLimit).offset(safeOffset)
      : await dataQuery;

    return { data, total: Number(countResult?.count || 0) };
  }

  async createAttendanceRecord(insertRecord: InsertAttendanceRecord): Promise<AttendanceRecord> {
    // Check if record already exists to avoid duplicates
    const [existing] = await db.select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.employeeCode, insertRecord.employeeCode),
          eq(attendanceRecords.date, insertRecord.date)
        )
      );

    if (existing) {
      const nextNotes = mergeNotes(existing.notes, insertRecord.notes ?? null);
      const [updated] = await db.update(attendanceRecords)
        .set({ ...insertRecord, notes: nextNotes || null })
        .where(eq(attendanceRecords.id, existing.id))
        .returning();
      return updated;
    }

    const [record] = await db.insert(attendanceRecords).values(insertRecord).returning();
    return record;
  }

  async updateAttendanceRecord(id: number, update: Partial<InsertAttendanceRecord>): Promise<AttendanceRecord> {
    const [record] = await db.update(attendanceRecords).set(update).where(eq(attendanceRecords.id, id)).returning();
    return record;
  }

  async getAttendanceRecord(employeeCode: string, date: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeCode, employeeCode), eq(attendanceRecords.date, date)));
    return record;
  }

  // Bulk
  async createEmployeesBulk(insertEmployees: InsertEmployee[]): Promise<Employee[]> {
    if (insertEmployees.length === 0) return [];
    // Handle potential duplicate codes by skipping or updating
    // For simplicity, we filter out existing ones or use onConflictDoNothing
    return await db.insert(employees)
      .values(insertEmployees)
      .onConflictDoNothing({ target: employees.code })
      .returning();
  }

  async createPunchesBulk(insertPunches: InsertBiometricPunch[]): Promise<BiometricPunch[]> {
    if (insertPunches.length === 0) return [];
    return await db.insert(biometricPunches).values(insertPunches).returning();
  }
}

export const storage = new DatabaseStorage();

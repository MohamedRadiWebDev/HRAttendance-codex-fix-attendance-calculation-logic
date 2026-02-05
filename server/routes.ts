import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertEmployeeSchema, insertTemplateSchema, insertRuleSchema, insertAdjustmentSchema, ADJUSTMENT_TYPES } from "@shared/schema";
import { appendNotes, computeAdjustmentEffects, computeAutomaticNotes, computeOvertimeHours, computePenaltyEntries, normalizeTimeToHms, secondsToHms, timeStringToSeconds } from "./attendance-utils";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Employees
  app.get(api.employees.list.path, async (req, res) => {
    const employees = await storage.getEmployees();
    res.json(employees);
  });

  app.post(api.employees.create.path, async (req, res) => {
    try {
      const input = api.employees.create.input.parse(req.body);
      const employee = await storage.createEmployee(input);
      res.status(201).json(employee);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.employees.get.path, async (req, res) => {
    const employee = await storage.getEmployee(Number(req.params.id));
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json(employee);
  });

  app.put(api.employees.update.path, async (req, res) => {
    try {
      const input = api.employees.update.input.parse(req.body);
      const employee = await storage.updateEmployee(Number(req.params.id), input);
      res.json(employee);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Templates
  app.get(api.templates.list.path, async (req, res) => {
    const templates = await storage.getTemplates();
    res.json(templates);
  });

  app.post(api.templates.create.path, async (req, res) => {
    try {
      const input = api.templates.create.input.parse(req.body);
      const template = await storage.createTemplate(input);
      res.status(201).json(template);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input" });
      }
      throw err;
    }
  });

  app.delete(api.templates.delete.path, async (req, res) => {
    await storage.deleteTemplate(Number(req.params.id));
    res.status(204).end();
  });

  // Rules
  app.get(api.rules.list.path, async (req, res) => {
    const rules = await storage.getRules();
    res.json(rules);
  });

  app.post(api.rules.create.path, async (req, res) => {
    try {
      const input = api.rules.create.input.parse(req.body);
      const rule = await storage.createRule(input);
      res.status(201).json(rule);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.rules.delete.path, async (req, res) => {
    await storage.deleteRule(Number(req.params.id));
    res.status(204).end();
  });

  app.put(api.rules.update.path, async (req, res) => {
    try {
      const input = api.rules.update.input.parse(req.body);
      const rule = await storage.updateRule(Number(req.params.id), input);
      res.json(rule);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post("/api/rules/import", async (req, res) => {
    try {
      const rules = z.array(insertRuleSchema).parse(req.body);
      const results = [];
      for (const rule of rules) {
        results.push(await storage.createRule(rule));
      }
      res.json({ message: "Imported rules", count: results.length });
    } catch (err) {
      res.status(400).json({ message: "Invalid rule format" });
    }
  });

  // Adjustments
  app.get(api.adjustments.list.path, async (req, res) => {
    const { startDate, endDate, employeeCode, type } = req.query;
    const adjustments = await storage.getAdjustments({
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      employeeCode: employeeCode ? String(employeeCode) : undefined,
      type: type ? String(type) : undefined,
    });
    res.json(adjustments);
  });

  app.post(api.adjustments.create.path, async (req, res) => {
    try {
      const input = api.adjustments.create.input.parse(req.body);
      const adj = await storage.createAdjustment(input);
      res.status(201).json(adj);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.adjustments.import.path, async (req, res) => {
    try {
      const { rows, sourceFileName } = api.adjustments.import.input.parse(req.body);
      const employees = await storage.getEmployees();
      const employeeCodes = new Set(employees.map((emp) => emp.code));
      const allowedTypes = new Set(ADJUSTMENT_TYPES);

      const invalid: { rowIndex: number; reason: string }[] = [];
      const validRows = rows.filter((row: any) => {
        if (!employeeCodes.has(row.employeeCode)) {
          invalid.push({ rowIndex: row.rowIndex ?? 0, reason: "كود الموظف غير موجود" });
          return false;
        }
        if (!allowedTypes.has(row.type)) {
          invalid.push({ rowIndex: row.rowIndex ?? 0, reason: "نوع غير مسموح" });
          return false;
        }
        const fromSeconds = timeStringToSeconds(row.fromTime);
        const toSeconds = timeStringToSeconds(row.toTime);
        if (fromSeconds >= toSeconds) {
          invalid.push({ rowIndex: row.rowIndex ?? 0, reason: "وقت البداية يجب أن يكون قبل النهاية" });
          return false;
        }
        return true;
      }).map((row: any) => ({
        employeeCode: row.employeeCode,
        date: row.date,
        type: row.type,
        fromTime: normalizeTimeToHms(row.fromTime),
        toTime: normalizeTimeToHms(row.toTime),
        source: row.source || "excel",
        sourceFileName: sourceFileName || row.sourceFileName || null,
        importedAt: new Date(),
        note: row.note || null,
      }));

      if (validRows.length > 0) {
        await storage.createAdjustmentsBulk(validRows);
      }
      res.json({ inserted: validRows.length, invalid });
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // Attendance
  app.get(api.attendance.list.path, async (req, res) => {
    const { startDate, endDate, employeeCode, page = 1, limit = 50 } = req.query;
    // Remove strict validation for debugging or allow broader range
    const effectiveStart = startDate ? String(startDate) : "1970-01-01";
    const effectiveEnd = endDate ? String(endDate) : "2099-12-31";
    
    const limitNumber = Number(limit);
    const safeLimit = Number.isFinite(limitNumber) && limitNumber > 0 ? limitNumber : 0;
    const pageNumber = Number(page);
    const safePage = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
    const offset = safeLimit > 0 ? (safePage - 1) * safeLimit : 0;
    const { data, total } = await storage.getAttendance(
      effectiveStart, 
      effectiveEnd, 
      employeeCode as string,
      safeLimit,
      offset
    );
    res.json({ data, total, page: safePage, limit: safeLimit });
  });

  app.post(api.attendance.process.path, async (req, res) => {
    const { startDate, endDate, timezoneOffsetMinutes } = req.body;
    try {
      // offsetMinutes is used to convert local time to UTC for punch lookup
      // If the client is in GMT+2, offsetMinutes is -120
      const offsetMinutes = Number.isFinite(Number(timezoneOffsetMinutes))
        ? Number(timezoneOffsetMinutes)
        : -120; // Default to Cairo time (GMT+2) if not provided
      
      const toLocal = (date: Date) => new Date(date.getTime() - offsetMinutes * 60 * 1000);
      
      const formatLocalDay = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const allEmployees = await storage.getEmployees();
      
      // Compute punch fetch bounds in UTC
      const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
      const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
      
      // Boundaries in UTC
      const punchStart = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
      const punchEnd = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
      
      // Adjust bounds based on timezone to ensure we catch all potential punches
      // We expand the search by 12 hours on each side to be safe
      const searchStart = new Date(punchStart.getTime() + offsetMinutes * 60 * 1000 - (12 * 60 * 60 * 1000));
      const searchEnd = new Date(punchEnd.getTime() + offsetMinutes * 60 * 1000 + (12 * 60 * 60 * 1000));
      
      const punches = await storage.getPunches(searchStart, searchEnd);
      const rules = await storage.getRules();
      const adjustments = await storage.getAdjustments();
      
      let processedCount = 0;

      const adjustmentsByEmployeeDate = new Map<string, typeof adjustments>();
      adjustments.forEach((adjustment) => {
        const key = `${adjustment.employeeCode}__${adjustment.date}`;
        const existing = adjustmentsByEmployeeDate.get(key) || [];
        existing.push(adjustment);
        adjustmentsByEmployeeDate.set(key, existing);
      });
      
      // Iterate days in local-date space
      const startLocal = new Date(Date.UTC(startYear, startMonth - 1, startDay));
      const endLocal = new Date(Date.UTC(endYear, endMonth - 1, endDay));

      for (const employee of allEmployees) {
        const punchesByDate = new Map<string, typeof punches>();
        punches.forEach((punch) => {
          if (punch.employeeCode !== employee.code) return;
          const localPunch = toLocal(punch.punchDatetime);
          const py = localPunch.getUTCFullYear();
          const pm = String(localPunch.getUTCMonth() + 1).padStart(2, "0");
          const pd = String(localPunch.getUTCDate()).padStart(2, "0");
          const dateKey = `${py}-${pm}-${pd}`;
          const list = punchesByDate.get(dateKey) || [];
          list.push(punch);
          punchesByDate.set(dateKey, list);
        });

        punchesByDate.forEach((list) => {
          list.sort((a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime());
        });

        const extraNotesByKey = new Map<string, string[]>();
        const addExtraNote = (key: string, note: string) => {
          const existing = extraNotesByKey.get(key) || [];
          existing.push(note);
          extraNotesByKey.set(key, existing);
        };

        const shiftStartHour = Number.parseInt((employee.shiftStart || "09:00").split(":")[0], 10);
        const arrivalWindows: Record<number, { start: number; end: number }> = {
          9: { start: 6, end: 12 },
          8: { start: 5, end: 11 },
          7: { start: 4, end: 10 },
        };
        const arrivalWindow = arrivalWindows[shiftStartHour] || arrivalWindows[9];
        const isOvernightPunch = (date: Date) => {
          const hour = date.getUTCHours();
          return hour >= 0 && hour <= 5;
        };
        const isNormalArrivalPunch = (date: Date) => {
          const hour = date.getUTCHours();
          return hour >= arrivalWindow.start && hour <= arrivalWindow.end;
        };
        const isEarlyShiftEdge = (date: Date) => {
          const hour = date.getUTCHours();
          const minute = date.getUTCMinutes();
          return shiftStartHour <= 7 && (hour === 4 && minute >= 30 || hour === 5 && minute === 0);
        };

        for (let d = new Date(startLocal); d <= endLocal; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = formatLocalDay(d);
          const prevDate = new Date(d);
          prevDate.setUTCDate(prevDate.getUTCDate() - 1);
          const prevDateStr = formatLocalDay(prevDate);
          const dayPunches = punchesByDate.get(dateStr) || [];
          const prevPunches = punchesByDate.get(prevDateStr) || [];

          if (dayPunches.length === 0) continue;

          const overnightPunches = dayPunches.filter((punch) => {
            const localPunch = toLocal(punch.punchDatetime);
            return isOvernightPunch(localPunch);
          });

          if (overnightPunches.length === 0) continue;

          overnightPunches.forEach((punch) => {
            const localPunch = toLocal(punch.punchDatetime);
            const hasPrevCheckIn = prevPunches.length > 0;
            const hasPrevCheckOut = prevPunches.length > 1;
            if (!hasPrevCheckIn) return;

            const hasNormalArrival = dayPunches.some((candidate) => {
              if (candidate === punch) return false;
              const localCandidate = toLocal(candidate.punchDatetime);
              return isNormalArrivalPunch(localCandidate);
            });

            if (!hasPrevCheckOut && isEarlyShiftEdge(localPunch) && !hasNormalArrival) {
              return;
            }

            if (!hasPrevCheckOut || hasNormalArrival) {
              const updatedDayPunches = dayPunches.filter((item) => item !== punch);
              updatedDayPunches.sort((a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime());
              punchesByDate.set(dateStr, updatedDayPunches);

              const updatedPrevPunches = [...prevPunches, punch].sort(
                (a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime()
              );
              punchesByDate.set(prevDateStr, updatedPrevPunches);

              const timeLabel = `${String(localPunch.getUTCHours()).padStart(2, "0")}:${String(localPunch.getUTCMinutes()).padStart(2, "0")}`;
              addExtraNote(prevDateStr, `خروج بعد منتصف الليل ${timeLabel} (${dateStr})`);
            }
          });
        }

        for (let d = new Date(startLocal); d <= endLocal; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = formatLocalDay(d);
          
          // 1. Get applicable rules for this employee and date
          const activeRules = rules.filter(r => {
            const ruleStart = new Date(r.startDate);
            const ruleEnd = new Date(r.endDate);
            const current = new Date(dateStr);
            if (current < ruleStart || current > ruleEnd) return false;
            
            if (r.scope === 'all') return true;
            if (r.scope.startsWith('dept:') && employee.department === r.scope.replace('dept:', '')) return true;
            if (r.scope.startsWith('sector:') && employee.sector === r.scope.replace('sector:', '')) return true;
            if (r.scope.startsWith('emp:') && employee.code === r.scope.replace('emp:', '')) return true;
            return false;
          }).sort((a, b) => (b.priority || 0) - (a.priority || 0));

          // 2. Determine shift times based on rules or defaults (Saturday has a different default)
          const dayOfWeek = d.getUTCDay();
          const isSaturday = dayOfWeek === 6;
          let currentShiftStart = "09:00";
          let currentShiftEnd = "17:00"; // Default 8 hours
          let shiftSource = "Normal Default";
          
          const shiftRule = activeRules.find(r => r.ruleType === 'custom_shift');
          if (shiftRule) {
            currentShiftStart = (shiftRule.params as any).shiftStart || currentShiftStart;
            currentShiftEnd = (shiftRule.params as any).shiftEnd || currentShiftEnd;
            shiftSource = "Rule Override";
          } else if (isSaturday) {
            currentShiftStart = "10:00";
            currentShiftEnd = "16:00";
            shiftSource = "Saturday Default";
          }

          const isFriday = dayOfWeek === 5;
          const leaveRule = activeRules.find(r => r.ruleType === "attendance_exempt");
          const leaveTypeRaw = typeof (leaveRule?.params as any)?.leaveType === "string"
            ? String((leaveRule?.params as any)?.leaveType).toLowerCase()
            : "";
          const leaveCategory = leaveRule
            ? (leaveTypeRaw === "official" ? "Official Leave" : "HR Leave")
            : null;
          const isLeaveDay = Boolean(leaveRule);

          // 3. Check for adjustments (excel + manual)
          const dayAdjustments = adjustmentsByEmployeeDate.get(`${employee.code}__${dateStr}`) || [];

          // Get punches for this employee on this local day
          // A punch belongs to this day if its local time matches dateStr
          const dayPunches = (punchesByDate.get(dateStr) || [])
            .slice()
            .sort((a, b) => a.punchDatetime.getTime() - b.punchDatetime.getTime());

          const checkIn = dayPunches.length > 0 ? dayPunches[0].punchDatetime : null;
          const checkOut = dayPunches.length > 1 ? dayPunches[dayPunches.length - 1].punchDatetime : null;
          const checkInLocal = checkIn ? toLocal(checkIn) : null;
          const checkOutLocal = checkOut ? toLocal(checkOut) : null;

          let totalHours = 0;
          if (checkInLocal && checkOutLocal) {
            totalHours = (checkOutLocal.getTime() - checkInLocal.getTime()) / (1000 * 60 * 60);
          }

          if (isFriday || isLeaveDay) {
            // Friday attendance windows are validation-only (11:00-16:00 or 12:00-17:00), not shift changes.
            const attendedFriday = isFriday && dayPunches.some((punch) => {
              const localPunch = toLocal(punch.punchDatetime);
              const seconds = localPunch.getUTCHours() * 3600 + localPunch.getUTCMinutes() * 60 + localPunch.getUTCSeconds();
              const windowAStart = 11 * 3600;
              const windowAEnd = 16 * 3600;
              const windowBStart = 12 * 3600;
              const windowBEnd = 17 * 3600;
              return (seconds >= windowAStart && seconds <= windowAEnd)
                || (seconds >= windowBStart && seconds <= windowBEnd);
            });
            const extraNotes = extraNotesByKey.get(dateStr) || [];
            const shiftTrace = `Shift ${currentShiftStart}-${currentShiftEnd} (${shiftSource})`;
            await storage.createAttendanceRecord({
              employeeCode: employee.code,
              date: dateStr,
              checkIn,
              checkOut,
              totalHours: isFriday ? 0 : totalHours,
              status: isFriday ? (attendedFriday ? "Friday Attended" : "Friday") : "Comp Day",
              overtimeHours: 0,
              penalties: [],
              isOvernight: false,
              notes: appendNotes(isLeaveDay ? leaveCategory : null, [...extraNotes, shiftTrace]),
              missionStart: null,
              missionEnd: null,
              halfDayExcused: false,
            });
            processedCount++;
            continue;
          }

          if (dayPunches.length > 0 || dayAdjustments.length > 0) {
            const checkInSeconds = checkInLocal
              ? checkInLocal.getUTCHours() * 3600 + checkInLocal.getUTCMinutes() * 60 + checkInLocal.getUTCSeconds()
              : null;
            const checkOutSeconds = checkOutLocal
              ? checkOutLocal.getUTCHours() * 3600 + checkOutLocal.getUTCMinutes() * 60 + checkOutLocal.getUTCSeconds()
              : null;

            const adjustmentEffects = computeAdjustmentEffects({
              shiftStart: currentShiftStart,
              shiftEnd: currentShiftEnd,
              adjustments: dayAdjustments.map((adj) => ({
                type: adj.type,
                fromTime: adj.fromTime,
                toTime: adj.toTime,
              })),
              checkInSeconds,
              checkOutSeconds,
            });

            const toUtcFromSeconds = (seconds: number) => {
              const hours = Math.floor(seconds / 3600);
              const minutes = Math.floor((seconds % 3600) / 60);
              const secs = Math.floor(seconds % 60);
              const shiftTimeUTC = new Date(Date.UTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate(),
                hours,
                minutes,
                secs
              ));
              shiftTimeUTC.setTime(shiftTimeUTC.getTime() + offsetMinutes * 60 * 1000);
              return shiftTimeUTC;
            };

            const effectiveShiftStartUTC = toUtcFromSeconds(adjustmentEffects.effectiveShiftStartSeconds);
            const effectiveShiftEndUTC = toUtcFromSeconds(adjustmentEffects.effectiveShiftEndSeconds);
            const missionStart = adjustmentEffects.missionStartSeconds !== null
              ? secondsToHms(adjustmentEffects.missionStartSeconds)
              : null;
            const missionEnd = adjustmentEffects.missionEndSeconds !== null
              ? secondsToHms(adjustmentEffects.missionEndSeconds)
              : null;

            const firstStampSeconds = adjustmentEffects.firstStampSeconds;
            const lastStampSeconds = adjustmentEffects.lastStampSeconds;
            if (firstStampSeconds !== null && lastStampSeconds !== null) {
              const firstStampUTC = toUtcFromSeconds(firstStampSeconds);
              const lastStampUTC = toUtcFromSeconds(lastStampSeconds);
              totalHours = (lastStampUTC.getTime() - firstStampUTC.getTime()) / (1000 * 60 * 60);
            }

            const penalties: any[] = [];
            let status = "Present";
            const graceMinutes = 15;
            const suppressPenalties = adjustmentEffects.suppressPenalties;
            const hasMission = adjustmentEffects.missionStartSeconds !== null && adjustmentEffects.missionEndSeconds !== null;
            const halfDayExcused = adjustmentEffects.halfDayExcused;
            const excusedByHalfDayNoPunch = halfDayExcused && !checkIn && !checkOut;
            const excusedByMission = hasMission;
            const excusedDay = excusedByHalfDayNoPunch || excusedByMission;
            const isExcusedForPenalties = excusedDay || suppressPenalties;
            let latePenaltyValue = 0;
            let lateMinutes = 0;

            if (!isExcusedForPenalties && checkIn) {
              const diffMs = checkIn.getTime() - effectiveShiftStartUTC.getTime();
              lateMinutes = Math.max(0, Math.ceil(diffMs / (1000 * 60)));

              if (diffMs > graceMinutes * 60 * 1000) {
                status = "Late";
                if (lateMinutes > 60) latePenaltyValue = 1;
                else if (lateMinutes > 30) latePenaltyValue = 0.5;
                else latePenaltyValue = 0.25;
              } else {
                status = "Present";
              }
            } else if (!isExcusedForPenalties && !checkIn && !checkOut) {
              status = "Absent";
              penalties.push({ type: "غياب", value: 1 });
            }

            const missingCheckout = Boolean(checkIn && !checkOut) && !isExcusedForPenalties;
            const earlyLeaveThreshold = effectiveShiftEndUTC.getTime() - graceMinutes * 60 * 1000;
            const earlyLeaveTriggered = Boolean(
              checkOut &&
              !missingCheckout &&
              !isExcusedForPenalties &&
              checkOut.getTime() < earlyLeaveThreshold
            );

            penalties.push(
              ...computePenaltyEntries({
                isExcused: isExcusedForPenalties,
                latePenaltyValue,
                lateMinutes,
                missingCheckout,
                earlyLeaveTriggered,
              })
            );

            if (excusedDay) {
              status = hasMission && adjustmentEffects.missionEndSeconds !== null &&
                adjustmentEffects.missionEndSeconds >= timeStringToSeconds(currentShiftEnd)
                ? "Present"
                : "Excused";
            }
            const autoNotes = computeAutomaticNotes({
              existingNotes: null,
              checkInExists: Boolean(checkIn),
              checkOutExists: Boolean(checkOut),
              missingStampExcused: excusedDay,
              earlyLeaveExcused: excusedDay,
              checkOutBeforeEarlyLeave: Boolean(checkOut && checkOut.getTime() < earlyLeaveThreshold),
            });

            const overtimeHours = computeOvertimeHours({
              shiftEnd: currentShiftEnd,
              checkOutSeconds,
            });

            const extraNotes = extraNotesByKey.get(dateStr) || [];
            const shiftTrace = `Shift ${currentShiftStart}-${currentShiftEnd} (${shiftSource})`;
            await storage.createAttendanceRecord({
              employeeCode: employee.code,
              date: dateStr,
              checkIn,
              checkOut,
              totalHours,
              status,
              overtimeHours,
              penalties,
              isOvernight: false,
              notes: appendNotes(autoNotes || null, [...extraNotes, shiftTrace]),
              missionStart,
              missionEnd,
              halfDayExcused,
            });
            processedCount++;
          } else {
            // Absent
             const extraNotes = extraNotesByKey.get(dateStr) || [];
             const shiftTrace = `Shift ${currentShiftStart}-${currentShiftEnd} (${shiftSource})`;
             await storage.createAttendanceRecord({
              employeeCode: employee.code,
              date: dateStr,
              checkIn: null,
              checkOut: null,
              totalHours: 0,
              status: "Absent",
              penalties: [{ type: "غياب", value: 1 }],
              overtimeHours: 0,
              isOvernight: false,
              notes: appendNotes(null, [...extraNotes, shiftTrace]),
              missionStart: null,
              missionEnd: null,
              halfDayExcused: false,
            });
            processedCount++;
          }
        }
      }

      res.json({ message: "Processing completed", processedCount });
    } catch (err: any) {
      console.error("Processing Error:", err);
      res.status(500).json({ message: "Failed to process attendance", error: err.message });
    }
  });

  // Import
  app.post(api.import.punches.path, async (req, res) => {
    try {
      const punches = z.array(z.object({
        employeeCode: z.string(),
        punchDatetime: z.string().transform(val => new Date(val)),
      })).parse(req.body);
      const result = await storage.createPunchesBulk(punches);
      res.json({ message: "Imported punches", count: result.length });
    } catch (err) {
      console.error("Import Punches Error:", err);
      res.status(400).json({ message: "Invalid punch data format" });
    }
  });

  app.post(api.import.employees.path, async (req, res) => {
    const employees = req.body;
    const result = await storage.createEmployeesBulk(employees);
    res.json({ message: "Imported employees", count: result.length });
  });

  // Seeding
  const employeesCount = await storage.getEmployees();
  if (employeesCount.length === 0) {
    console.log("Database is empty. Ready for import.");
  }

  // Wiping Data
  app.post("/api/admin/wipe-data", async (req, res) => {
    try {
      await storage.wipeAllData();
      res.json({ message: "تم مسح كافة البيانات بنجاح" });
    } catch (err: any) {
      res.status(500).json({ message: "فشل مسح البيانات", error: err.message });
    }
  });

  return httpServer;
}

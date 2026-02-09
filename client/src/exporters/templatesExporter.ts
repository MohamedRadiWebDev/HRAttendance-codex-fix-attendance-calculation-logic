import * as XLSX from "xlsx";

const addInstructionsSheet = (workbook: XLSX.WorkBook, lines: string[]) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["شرح استخدام القالب"],
    ...lines.map((line) => [line]),
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "شرح");
};

const buildWorkbook = (name: string, headers: string[], rows: (string | number)[][], instructions: string[]) => {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
  addInstructionsSheet(workbook, instructions);
  return workbook;
};

export const buildPunchesTemplate = () => {
  const headers = ["كود", "التاريخ_والوقت"];
  const rows = [
    ["101", "15/01/2024 08:55"],
    ["101", "15/01/2024 17:05"],
    ["205", "16/01/2024 09:10"],
  ];
  return buildWorkbook("بصمة", headers, rows, [
    "استخدم الصيغة: dd/MM/yyyy HH:mm أو dd/MM/yyyy HH:mm:ss",
    "يمكن استخدام نفس الكود عدة مرات لنفس اليوم.",
    "تأكد من تطابق الكود مع بيانات الموظفين.",
  ]);
};

export const buildEmployeesTemplate = () => {
  const headers = [
    "كود",
    "الاسم",
    "القطاع",
    "الادارة",
    "القسم",
    "الوظيفة",
    "الفرع",
    "المحافظة",
    "تاريخ التعيين",
    "تاريخ ترك العمل",
  ];
  const rows = [
    ["101", "أحمد محمود", "التحصيل", "ادارة التحصيل", "قسم 1", "محصل", "الفرع الرئيسي", "القاهرة", "2022-01-10", ""],
    ["205", "سارة علي", "الموارد البشرية", "الشؤون الإدارية", "قسم التعيينات", "أخصائي موارد", "الفرع الرئيسي", "الجيزة", "2021-06-01", ""],
    ["310", "محمد حسن", "المبيعات", "ادارة المبيعات", "قسم التجزئة", "مندوب مبيعات", "فرع مدينة نصر", "القاهرة", "2020-09-15", ""],
  ];
  return buildWorkbook("الموظفين", headers, rows, [
    "يمكن إضافة أعمدة إضافية حسب الحاجة دون التأثير على الاستيراد.",
    "تاريخ التعيين بصيغة yyyy-MM-dd أو dd/MM/yyyy.",
  ]);
};

export const buildLeavesTemplate = () => {
  const headers = ["الكود", "الاسم", "التاريخ", "من", "الي", "النوع", "ملاحظة"];
  const rows = [
    ["101", "أحمد محمود", "2024-02-01", "2024-02-01", "2024-02-01", "اجازة رسمية", "عيد وطني"],
    ["205", "سارة علي", "2024-02-10", "2024-02-10", "2024-02-12", "اجازات التحصيل", "إجازة قطاع"],
    ["310", "محمد حسن", "2024-02-20", "2024-02-20", "2024-02-20", "اجازة رسمية", ""],
  ];
  return buildWorkbook("الإجازات", headers, rows, [
    "النوع يدعم: اجازة رسمية، اجازات التحصيل.",
    "يمكن ترك الحقول من/إلى فارغة لاستخدام التاريخ فقط.",
  ]);
};

export const buildPermissionsTemplate = () => {
  const headers = ["الكود", "الاسم", "التاريخ", "من", "الي", "النوع", "ملاحظة"];
  const rows = [
    ["101", "أحمد محمود", "2024-03-05", "09:00", "11:00", "اذن صباحي", "زيارة طبية"],
    ["205", "سارة علي", "2024-03-06", "15:00", "17:00", "اذن مسائي", "ظرف عائلي"],
    ["310", "محمد حسن", "2024-03-07", "09:00", "13:00", "إجازة نص يوم", "إجازة نصف يوم"],
  ];
  return buildWorkbook("الأذونات", headers, rows, [
    "النوع يدعم: اذن صباحي، اذن مسائي، إجازة نص يوم، مأمورية.",
    "استخدم الوقت بصيغة HH:mm أو HH:mm:ss.",
  ]);
};

export const buildRulesTemplate = () => {
  const headers = ["id", "name", "priority", "ruleType", "scope", "startDate", "endDate", "shiftStart", "shiftEnd", "note"];
  const rows = [
    ["1", "ورديات التحصيل", "10", "custom_shift", "sector:التحصيل", "2024-01-01", "2024-12-31", "08:00", "16:00", "تطبيق وردية مبكرة"],
    ["2", "إعفاء موظف", "5", "attendance_exempt", "emp:659", "2024-05-01", "2024-05-31", "", "", "إعفاء مؤقت"],
    ["3", "ورديات خاصة", "8", "custom_shift", "dept:ادارة التحصيل", "2024-02-01", "2024-06-30", "09:00", "17:00", "دوام مرن"],
  ];
  return buildWorkbook("القواعد", headers, rows, [
    "ruleType المتاح: custom_shift, attendance_exempt, penalty_override, ignore_biometric, overtime_overnight, overnight_stay.",
    "scope أمثلة: emp:659 أو emp:289,31,515 أو dept:ادارة التحصيل أو sector:التحصيل.",
  ]);
};

import * as XLSX from 'xlsx';

export interface ColumnMappingOption {
  key: string;
  label: string;
  required: boolean;
  type?: 'string' | 'number' | 'date';
}

export const EXCEL_MODULE_SCHEMAS: Record<string, ColumnMappingOption[]> = {
  machines: [
    { key: 'machineNumber', label: 'Machine Number', required: true },
    { key: 'model', label: 'Model / Size', required: true },
    { key: 'project', label: 'Project', required: false },
    { key: 'customer', label: 'Customer', required: false },
    { key: 'planMonth', label: 'Plan Month', required: false },
    { key: 'currentDepartment', label: 'Department', required: true },
    { key: 'currentStatus', label: 'Current Status', required: false },
    { key: 'plannedDate', label: 'Planned Date', required: false },
    { key: 'remarks', label: 'Remarks', required: false },
  ],
  monthly_plans: [
    { key: 'month', label: 'Month', required: true },
    { key: 'year', label: 'Year', required: true },
    { key: 'department', label: 'Department', required: true },
    { key: 'machineModel', label: 'Model / Size', required: false },
    { key: 'machineNumber', label: 'Machine Number', required: false },
    { key: 'project', label: 'Project', required: false },
    { key: 'operationWork', label: 'Operation / Work', required: false },
    { key: 'category', label: 'Category', required: false },
    { key: 'plannedQuantity', label: 'Target / Planned Qty', required: true, type: 'number' },
    { key: 'actualQuantity', label: 'Actual Qty', required: false, type: 'number' },
    { key: 'plannedTime', label: 'Planned Time', required: false },
    { key: 'responsibleEmployee', label: 'Responsible Employee', required: false },
    { key: 'priority', label: 'Priority', required: false },
    { key: 'remarks', label: 'Remarks', required: false },
  ],
  weekly_plans: [
    { key: 'weekStartDate', label: 'Week Start Date', required: true },
    { key: 'weekEndDate', label: 'Week End Date', required: true },
    { key: 'department', label: 'Department', required: true },
    { key: 'machineModel', label: 'Model / Size', required: false },
    { key: 'machineNumber', label: 'Machine Number', required: false },
    { key: 'project', label: 'Project', required: false },
    { key: 'operationWork', label: 'Operation / Work', required: false },
    { key: 'plannedQuantity', label: 'Planned Qty', required: true, type: 'number' },
    { key: 'actualQuantity', label: 'Actual Qty', required: false, type: 'number' },
    { key: 'responsibleEmployee', label: 'Responsible Employee', required: false },
    { key: 'priority', label: 'Priority', required: false },
    { key: 'remarks', label: 'Remarks', required: false },
  ],
  yearly_plans: [
    { key: 'year', label: 'Year', required: true },
    { key: 'department', label: 'Department', required: true },
    { key: 'machineModel', label: 'Model / Size', required: false },
    { key: 'machineNumber', label: 'Machine Number', required: false },
    { key: 'project', label: 'Project', required: false },
    { key: 'targetQuantity', label: 'Target Qty', required: true, type: 'number' },
    { key: 'targetAmount', label: 'Target Amount', required: false, type: 'number' },
    { key: 'responsiblePerson', label: 'Responsible Person', required: false },
    { key: 'remarks', label: 'Remarks', required: false },
  ],
  quality_operations: [
    { key: 'machineModel', label: 'Machine Model / Size', required: true },
    { key: 'category', label: 'Category (Manufacturing / Bought-Out / Other)', required: true },
    { key: 'operationName', label: 'Operation Name', required: true },
    { key: 'partCode', label: 'Part Code', required: false },
    { key: 'srNo', label: 'Sr. No.', required: false },
    { key: 'processDepartment', label: 'Process / Department', required: false },
    { key: 'plannedInspectionTime', label: 'Planned Inspection Time', required: false },
    { key: 'specificationRequirement', label: 'Specification / Requirement', required: false },
  ],
  department_work: [
    { key: 'department', label: 'Department', required: true },
    { key: 'title', label: 'Work Title / Task', required: true },
    { key: 'machineNumber', label: 'Machine Number', required: false },
    { key: 'machineModel', label: 'Model / Size', required: false },
    { key: 'operationWork', label: 'Operation', required: false },
    { key: 'plannedQuantity', label: 'Planned Qty', required: false, type: 'number' },
    { key: 'actualQuantity', label: 'Actual Qty', required: false, type: 'number' },
    { key: 'status', label: 'Status (Pending / In Progress / Completed / Delayed)', required: true },
    { key: 'assignedTo', label: 'Assigned Employee', required: false },
    { key: 'dueDate', label: 'Due Date', required: false },
  ],
};

export async function parseExcelFile(file: File): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });

  if (!jsonData || jsonData.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = (jsonData[0] as any[]).map((h) => String(h || '').trim()).filter(Boolean);
  const dataRows: Record<string, any>[] = [];

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as any[];
    if (!row || row.every((c) => c === undefined || c === null || c === '')) continue;
    const rowObj: Record<string, any> = {};
    rawHeaders.forEach((header, idx) => {
      rowObj[header] = row[idx] !== undefined ? row[idx] : '';
    });
    dataRows.push(rowObj);
  }

  return { headers: rawHeaders, rows: dataRows };
}

export function autoDetectMapping(headers: string[], schema: ColumnMappingOption[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  schema.forEach((field) => {
    const fieldWords = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const keyWords = field.key.toLowerCase().replace(/[^a-z0-9]/g, '');

    const foundHeader = headers.find((h) => {
      const cleanHeader = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        cleanHeader === fieldWords ||
        cleanHeader === keyWords ||
        cleanHeader.includes(keyWords) ||
        keyWords.includes(cleanHeader) ||
        (keyWords === 'machinenumber' && (cleanHeader === 'machineno' || cleanHeader === 'machine')) ||
        (keyWords === 'machinemodel' && (cleanHeader === 'size' || cleanHeader === 'model')) ||
        (keyWords === 'plannedquantity' && (cleanHeader === 'target' || cleanHeader === 'targetqty')) ||
        (keyWords === 'actualquantity' && (cleanHeader === 'actual' || cleanHeader === 'actualqty'))
      );
    });

    if (foundHeader) {
      mapping[field.key] = foundHeader;
    }
  });

  return mapping;
}

export type ExcelImportType = 'planning' | 'machines' | 'quality_ops' | 'department_work';

export function generateExcelTemplate(type: ExcelImportType) {
  const schemaKey =
    type === 'planning' ? 'monthly_plans' : type === 'quality_ops' ? 'quality_operations' : type;
  const schema = EXCEL_MODULE_SCHEMAS[schemaKey] || EXCEL_MODULE_SCHEMAS.machines;

  const headers = schema.map((col) => col.label);
  const sampleRow: Record<string, any> = {};
  schema.forEach((col) => {
    if (col.type === 'number') {
      sampleRow[col.label] = 10;
    } else {
      sampleRow[col.label] = `Sample ${col.label}`;
    }
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, Object.values(sampleRow)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `Accurate_Gauging_${type}_Template.xlsx`);
}

export function exportToExcel(filename: string, sheetName: string, data: Record<string, any>[]) {
  if (!data || data.length === 0) {
    const emptyWb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['No data available for export']]);
    XLSX.utils.book_append_sheet(emptyWb, ws, sheetName);
    XLSX.writeFile(emptyWb, `${filename}.xlsx`);
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Download standardized Excel template for Department Operation Master.
 * Exactly 3 columns: Machine Size | Part | Operation
 * Contains illustrative reference rows as requested.
 */
export function downloadOperationMasterExcelTemplate(departmentName?: string) {
  const wb = XLSX.utils.book_new();

  // Exactly 3 columns
  const headers = ['Machine Size', 'Part', 'Operation'];
  const sampleData = [
    headers,
    ['685', 'Base', 'Surface Lapping'],
    ['685', 'Base', 'Flatness Check'],
    ['685', 'Base', 'Insert Fitment'],
    ['685', 'Table', 'Lapping'],
    ['685', 'Table', 'Finishing'],
    ['8106', 'Base', 'Grinding'],
    ['8106', 'Table', 'Drilling'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  // Set friendly column widths
  ws['!cols'] = [
    { wch: 20 }, // Machine Size
    { wch: 24 }, // Part
    { wch: 34 }, // Operation
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Operation Master');

  const deptSuffix = departmentName
    ? `_${departmentName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    : '';
  XLSX.writeFile(wb, `Operation_Master_Template${deptSuffix}.xlsx`);
}

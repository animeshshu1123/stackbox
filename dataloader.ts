import * as XLSX from 'xlsx';

export function loadExcelData(filePath: string, sheetName?: string): any[] {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(worksheet);
}

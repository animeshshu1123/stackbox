import * as XLSX from 'xlsx';

export interface ConsolidatedInventory {
    srcbin: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qty1: number;
    destBin: string;
}

export function exportToExcel(data: ConsolidatedInventory[], outputPath: string): void {
    const ws = XLSX.utils.json_to_sheet(data.map(item => ({
        "Bin Code": item.srcbin,
        "HU Code": item.huCode,
        "SKU Code": item.skuCode,
        "Batch": item.batch,
        "QTY": item.qty1,
        "TO BIN": item.destBin
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidated Results");
    XLSX.writeFile(wb, outputPath);
}

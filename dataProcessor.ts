import * as XLSX from 'xlsx';
import { loadExcelData } from './dataloader';

export interface InventoryItem {
    srcbin: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qty: number;
    qty1: number;
    destBin?: string;
}

export interface Bin {
    srcBin: string;
    numPallets: number;
}


// Function to populate storage bins from Excel data
export function populateStorageBins(storageData: any[]): Map<string, Bin> {
    const bins = new Map<string, Bin>();
    storageData.forEach((item: any) => {
        const srcBin = item['Code'] ? item['Code'].trim() : null;
        const binType = item['BinType Code'];

        if (!binType || binType.length === 0) {
            console.error(`Bin type is undefined or invalid for bin code ${srcBin}`);
            return;
        }

        const match = binType.match(/\d+/);
        if (match) {
            const numPallets = parseInt(match[0], 10);
            if (!isNaN(numPallets)) {
                bins.set(srcBin, { srcBin, numPallets });
            } else {
                console.error(`Extracted number of pallets is not valid for bin code ${srcBin}:`, match[0]);
            }
        } else {
            // console.error(`No digits found in bin type for bin code ${srcBin}`);
        }
    });
    return bins;
}

// Function to populate search sequence from Excel data
export function populateSearchSequence(searchSequenceData: any[]): Map<string, number> {
    const searchSequence = new Map<string, number>();
    searchSequenceData.forEach((item: any) => {
        const srcBin = item['Code'].trim();
        const sequence = parseInt(item['Search Sequence'], 10);
        if (!isNaN(sequence)) {
            searchSequence.set(srcBin, sequence);
        }
    });
    return searchSequence;
}

export function loadInventoryItems(inventoryFilePath: string): Map<string, InventoryItem[]> {
    const inventoryData = loadExcelData(inventoryFilePath);
    const inventoryItems = new Map<string, InventoryItem[]>();
    inventoryData.forEach((item: any) => {

        const status = item['Bin Status'];
        const lockStatus = item['LockStatus'];
        const quantity = parseInt(item['Quantity'], 10);
        const areaType = item['Area Type'];
        const qlty = item['Quality'];
        const LType = item['UOM'];

        if (status === 'ACTIVE' && areaType === 'INVENTORY' && LType === 'L2' && qlty==='Good' && 
            lockStatus === 'FREE' && quantity > 0) {
            const srcbin = item['Bin Code'];
            const inventoryItem: InventoryItem = {
                srcbin: srcbin,
                huCode: item['HU Code'],
                skuCode: parseInt(item['Sku Code'], 10),
                qty: parseFloat(item['Bin Occupancy %']),
                qty1 : parseInt(item['Quantity'], 10),
                batch: item['Batch']
            };
            if (!inventoryItems.has(srcbin)) {
                inventoryItems.set(srcbin, []);
            }
            inventoryItems.get(srcbin)?.push(inventoryItem);
        }
    });
    return inventoryItems;
}

// Function to load and process all required data from Excel
export function loadAndProcessData(inventoryFilePath: string, storageFilePath: string, storageSheetName: string, searchSequenceFilePath: string, searchSequenceSheetName: string): { bins: Map<string, Bin>, searchSequence: Map<string, number>, inventoryItems: Map<string, InventoryItem[]>} {
    const inventoryItems = loadInventoryItems(inventoryFilePath);
    
    const storageData = loadExcelData(storageFilePath, storageSheetName);
    const bins = populateStorageBins(storageData);

    const searchSequenceData = loadExcelData(searchSequenceFilePath, searchSequenceSheetName);
    const searchSequence = populateSearchSequence(searchSequenceData);

    return { bins, inventoryItems, searchSequence };
}


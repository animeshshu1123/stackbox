import * as XLSX from 'xlsx';

interface Bin {
    binCode: string;
    numPallets: number;
}

interface InventoryItem {
    binCode: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qty1: number;
    toHu?: string;
    toBin?: string;
}

interface PalletCapacity {
    skuCode: number;
    capacity: number;
}

interface ConsolidatedInventoryBin {
    binCode: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qty1: number;
    toBin: string;
}

interface ConsolidatedInventoryHu {
    binCode: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qtyMove: number;
    toHu: string;
}

interface BinSearchSequence {
    binCode: string;
    sequence: number;
}

const bins = new Map<string, Bin>();
const inventory = new Map<string, InventoryItem[]>();
const bestFitCapacities = new Map<number, number>();
const searchSequence = new Map<string, number>();
const binUsage = new Map<string, number>();

function loadExcelData(filePath: string, sheetName?: string): any[] {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Loaded ${data.length} rows from ${filePath}`);
    return data;
}

function populateStorageBins(storageData: any[]): void {
    storageData.forEach((item: any) => {
        const binCode = item['Bin Code'];
        const binType = item['Bin Type'];

        if (!binType || binType.length === 0) {
            console.error(`Bin type is undefined or invalid for bin code ${binCode}`);
            return;
        }

        const match = binType.match(/\d+/);
        if (match) {
            const numPallets = parseInt(match[0], 10);
            if (!isNaN(numPallets)) {
                bins.set(binCode, { binCode, numPallets });
            } else {
                console.error(`Extracted number of pallets is not valid for bin code ${binCode}:`, match[0]);
            }
        } else {
            // console.error(`No digits found in bin type for bin code ${binCode}`);
        }
    });
}

function populateBestFitCapacities(bestFitData: any[]): void {
    bestFitData.forEach((item: any) => {
        const skuCode = parseInt(item['SKU Code'], 10);
        const capacity = parseInt(item['Capacity'], 10);
        if (!isNaN(skuCode) && !isNaN(capacity)) {
            bestFitCapacities.set(skuCode, capacity);
        }
    });
    console.log(`Populated best fit capacities for ${bestFitCapacities.size} SKUs.`);
}

function populateSearchSequence(searchSequenceData: any[]): void {
    searchSequenceData.forEach((item: any) => {
        const binCode = item['Code'];
        const binType = item['Bucket (Good|Damaged)'];
        const sequence = parseInt(item['Search Sequence'], 10);
        if (binType === 'Good' && binCode && !isNaN(sequence)) {
            searchSequence.set(binCode, sequence);
        }
    });
    console.log(`Populated search sequences for ${searchSequence.size} bins.`);
}

function loadInventoryItems(inventoryData: any[]): void {
    const lockedItems = new Set<string>();

    // First pass to identify all locked items
    inventoryData.forEach((item: any) => {
        const inclusionStatus = item['Inclusion Status'];
        const lockStatus = item['LockStatus'];
        const skuCode = item['Sku Code'];
        const batch = item['Batch'];
        const binCode = item['Bin Code'];

        if (inclusionStatus === 'INCLUDED' && lockStatus === 'LOCKED') {
            const key = `${skuCode}-${batch}-${binCode}`;
            lockedItems.add(key);
        }
    });

    inventoryData.forEach((item: any) => {
        const inclusionStatus = item['Inclusion Status'];
        const bucket = item['Quality'];
        const status = item['Bin Status'];
        const lockStatus = item['LockStatus'];
        const quantity = parseInt(item['Quantity'], 10);
        const areatype = item['Area Type'];
        const skuCode = item['Sku Code'];
        const batch = item['Batch'];
        const binCode = item['Bin Code'];

        const key = `${skuCode}-${batch}-${binCode}`;
        if (lockedItems.has(key)) {
            return; 
        }

        if (inclusionStatus === 'INCLUDED' && areatype === 'INVENTORY' && bucket === 'Good' &&
            status === 'ACTIVE' && lockStatus === 'FREE' && quantity > 0) {
            const inventoryItem: InventoryItem = {
                binCode: binCode,
                huCode: item['HU Code'],
                skuCode: parseInt(skuCode, 10),
                batch: batch,
                qty1: quantity
            };

            if (!inventory.has(binCode)) {
                inventory.set(binCode, []);
            }
            inventory.get(binCode)?.push(inventoryItem);
        }
    });
}

function batchYearCalc(batch1: string, batch2: string): number {
    const firstDigit1 = batch1.charAt(0);
    const firstDigit2 = batch2.charAt(0);

    if (firstDigit1 === firstDigit2) {
        // Extract years from the batch strings and calculate normal difference
        const year1 = parseInt(batch1.substring(0, 4));
        const year2 = parseInt(batch2.substring(0, 4));
        return Math.abs(year1 - year2);
    } else {
        // Calculate difference based on the 2nd, 3rd, and 4th digits of each batch
        const nextThreeDigits1 = parseInt(batch1.substring(1, 4));
        const nextThreeDigits2 = parseInt(batch2.substring(1, 4));

        if (firstDigit1 < firstDigit2) {
            // Subtract the next three digits of the first batch from 365 and add the next three digits of the second batch
            return (365 - nextThreeDigits1) + nextThreeDigits2;
        } else {
            // Subtract the next three digits of the second batch from 365 and add the next three digits of the first batch
            return (365 - nextThreeDigits2) + nextThreeDigits1;
        }
    }
}

function consolidateInventoryMain(): ConsolidatedInventoryBin[] {
    const results: ConsolidatedInventoryBin[] = [];
    const inventoryBySkuAndBatch = new Map<string, InventoryItem[]>();

    const skuToBinItems = new Map<number, InventoryItem[]>();
    const binUsage = new Map<string, number>();
    var count = 0;
    var count1 = 0;

    // Initialize bin usage based on current inventory counts
    inventory.forEach(items => {
        items.forEach(item => {
            binUsage.set(item.binCode, (binUsage.get(item.binCode) || 0) + 1);
            if (!skuToBinItems.has(item.skuCode)) {
                skuToBinItems.set(item.skuCode, []);
            }
            skuToBinItems.get(item.skuCode).push(item);
        });
    });

    // Process each SKU group
    skuToBinItems.forEach((items, skuCode) => {
        // Sort bins within each SKU group
        items.sort((a, b) => (binUsage.get(a.binCode) || 0) - (binUsage.get(b.binCode) || 0));

        items.forEach(item => {
            const binCapacity = bins.get(item.binCode)?.numPallets;
            const currentBinUsage = binUsage.get(item.binCode);

            // Skip bins that already appear up to their numPallets limit
            if (currentBinUsage >= binCapacity) {
                return;
            }

            // Filter potential targets that meet batch closeness and capacity conditions
            const potentialTargets = items.filter(targetItem => {
                const batchYearDiff = batchYearCalc(item.batch, targetItem.batch);
                const targetBinUsage = binUsage.get(targetItem.binCode) || 0;
                const targetBinCapacity = bins.get(targetItem.binCode)?.numPallets || Infinity;

                return item.binCode !== targetItem.binCode && batchYearDiff <= 30 && targetBinUsage < targetBinCapacity;
            });

            // potentialTargets.sort((a, b) => (binUsage.get(b.binCode) || 0) - (binUsage.get(a.binCode) || 0));

            potentialTargets.sort((a, b) => {
                const usageDiffA = Math.abs(binUsage.get(a.binCode)-bins.get(a.binCode).numPallets);
                const usageDiffB = Math.abs(binUsage.get(b.binCode)-bins.get(b.binCode).numPallets);
            
                if (usageDiffA === usageDiffB) {
                    const sequenceDiffA = Math.abs((searchSequence.get(item.binCode) || 0) - (searchSequence.get(a.binCode) || 0));
                    const sequenceDiffB = Math.abs((searchSequence.get(item.binCode) || 0) - (searchSequence.get(b.binCode) || 0));
                    return sequenceDiffA - sequenceDiffB;
                }
            
                return (binUsage.get(b.binCode) || 0) - (binUsage.get(a.binCode) || 0);
            });            

            // Select the best target for consolidation
            if (potentialTargets.length > 0) {
                const target = potentialTargets[0];
                const combinedUsage = (binUsage.get(item.binCode) || 0) + (binUsage.get(target.binCode) || 0);

                if (binUsage.get(target.binCode) === 0) {
                    return;
                }

                if ((binUsage.get(item.binCode))>(binUsage.get(target.binCode))){
                    return;
                }

                if (combinedUsage <= (bins.get(target.binCode)?.numPallets)) {
                    results.push({
                        binCode: item.binCode,
                        huCode: item.huCode,
                        skuCode: item.skuCode,
                        batch: item.batch,
                        qty1: item.qty1,
                        toBin: target.binCode 
                    });

                    // Update bin usages
                    binUsage.set(target.binCode, combinedUsage); // Increment target bin usage
                    binUsage.set(item.binCode, (binUsage.get(item.binCode) || 0) - 1); // Decrement original bin usage if item is moved

                    // Check if the original bin is now empty
                    if ((binUsage.get(item.binCode) || 0) <= 0) {
                        // console.log(`Bin ${item.binCode} is now empty.`);
                        count1+=1;
                    }
                    count += Math.abs(binUsage.get(item.binCode)-bins.get(item.binCode).numPallets);
                    // item.qty1 = 0;  // Mark the bin as fully moved
                }
            }
        });
    });
    console.log(`Empty Bins:`, count1);
    console.log(`Free Pallet Positions:`, count);

    return results.filter(item => item.toBin && item.toBin !== item.binCode);
}

function consolidateInventoryHU(): ConsolidatedInventoryHu[] {
    const results: ConsolidatedInventoryHu[] = [];
    const inventoryBySkuAndBatch = new Map<string, InventoryItem[]>();

    var count = 0;

    inventory.forEach((items) => {
        items.forEach(item => {
            const key = item.skuCode + '-' + item.batch;
            if (!inventoryBySkuAndBatch.has(key)) {
                inventoryBySkuAndBatch.set(key, []);
            }
            inventoryBySkuAndBatch.get(key).push(item);
        });
    });

    inventoryBySkuAndBatch.forEach((items, key) => {
        items.sort((a, b) => a.qty1 - b.qty1); 

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            const capacity = bestFitCapacities.get(item.skuCode) || Infinity;

            for (let j = items.length - 1; j > i; j--) {
                let target = items[j];
                const totalQty = item.qty1 + target.qty1;

                if (totalQty <= capacity) {
                    results.push({
                        binCode: item.binCode,
                        huCode: item.huCode,
                        skuCode: item.skuCode,
                        batch: item.batch,
                        qtyMove: item.qty1,
                        toHu: target.huCode
                    });
                    target.qty1 += item.qty1;
                    // console.log(`HU ${item.huCode} is now empty.`);
                    item.qty1 = 0;
                    count += 1;
                    break;
                } else if (target.qty1 < capacity) {
                    const qtyMove = capacity - target.qty1;
                    results.push({
                        binCode: item.binCode,
                        huCode: item.huCode,
                        skuCode: item.skuCode,
                        batch: item.batch,
                        qtyMove: qtyMove,
                        toHu: target.huCode
                    });
                    target.qty1 += qtyMove;
                    item.qty1 -= qtyMove;
                    if (item.qty1 === 0) {
                        // console.log(`HU ${item.huCode} is now empty.`);
                        count += 1;
                    }
                }
            }
        }
    });
    console.log(`Pallets made empty:`,count);
    return results.filter(item => item.qtyMove > 0 && item.huCode !== item.toHu);
}


function exportToExcelBin(consolidatedItems, workbook) {
    const ws = XLSX.utils.json_to_sheet(consolidatedItems.map(item => ({
        "Bin Code": item.binCode,
        "HU Code": item.huCode,
        "SKU Code": item.skuCode,
        "Batch": item.batch,
        "QTY": item.qty1,
        "TO BIN": item.toBin
    })));
    XLSX.utils.book_append_sheet(workbook, ws, "Pallet Movement");
}

function exportToExcelHU(consolidatedItems, workbook) {
    const ws = XLSX.utils.json_to_sheet(consolidatedItems.map(item => ({
        "Bin Code": item.binCode,
        "HU Code": item.huCode,
        "SKU Code": item.skuCode,
        "Batch": item.batch,
        "QTY Moved": item.qtyMove,
        "TO Hu": item.toHu
    })));
    XLSX.utils.book_append_sheet(workbook, ws, "Quantity Movement");
}

function main() {
    const inventoryData = loadExcelData('InventoryDump7.xlsx');
    populateStorageBins(inventoryData);
    loadInventoryItems(inventoryData);
    const searchSequenceData = loadExcelData('SearchSequence.xlsx');
    populateSearchSequence(searchSequenceData);
    const bestFitData = loadExcelData('PalletBestfit.xlsx');
    populateBestFitCapacities(bestFitData);

    const consolidatedItemsBin = consolidateInventoryMain();
    const consolidatedItemsHU = consolidateInventoryHU();

    const workbook = XLSX.utils.book_new();
    exportToExcelBin(consolidatedItemsBin, workbook);
    exportToExcelHU(consolidatedItemsHU, workbook);

    XLSX.writeFile(workbook, 'FinalOutput.xlsx');
}

main();


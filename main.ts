import * as XLSX from 'xlsx';

interface Bin {
    srcbin: string;
    numPallets: number;
}

interface InventoryItem {
    srcbin: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qty: number;
    qty1: number;
    destBin?: string; 
}

interface ConsolidatedInventory {
    srcbin: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qty1: number;
    destBin: string;
}

interface BinSearchSequence {
    srcbin: string;
    sequence: number;
}

const bins = new Map<string, Bin>();
const inventory = new Map<string, InventoryItem[]>();
const searchSequence = new Map<string, number>();

function loadExcelData(filePath: string, sheetName?: string): any[] {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Loaded ${data.length} rows from ${filePath}`);
    return data;
}

function populateSearchSequence(searchSequenceData: any[]): void {
    searchSequenceData.forEach((item: any) => {
        const srcbin = item['Code'];
        const binType = item['Bucket (Good|Damaged)'];
        const sequence = parseInt(item['Search Sequence'], 10);
        if (binType === 'Good' && !isNaN(sequence)) {
            searchSequence.set(srcbin, sequence);
        }
    });
    console.log(`Populated search sequences for ${searchSequence.size} bins.`);
}

function populateStorageBins(storageData: any[]): void {
    storageData.forEach((item: any) => {
        const srcbin = item['Code'];
        const binType = item['BinType Code'];

        if (!binType || binType.length === 0) {
            console.error(`Bin type is undefined or invalid for bin code ${srcbin}`);
            return;
        }

        const match = binType.match(/\d+/);
        if (match) {
            const numPallets = parseInt(match[0], 10);
            if (!isNaN(numPallets)) {
                bins.set(srcbin, { srcbin, numPallets });
            } else {
                console.error(`Extracted number of pallets is not valid for bin code ${srcbin}:`, match[0]);
            }
        } else {
            // console.error(`No digits found in bin type for bin code ${srcbin}`);
        }
    });
    // console.log("Bins map has been populated with the following data:", bins);
}

function loadInventoryItems(inventoryData: any[]): void {
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
            if (!inventory.has(srcbin)) {
                inventory.set(srcbin, []);
            }
            inventory.get(srcbin)?.push(inventoryItem);
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

function consolidateInventory(): ConsolidatedInventory[] {
    const results: ConsolidatedInventory[] = [];
    const skuToBinItems = new Map<number, InventoryItem[]>();
    const binUsage = new Map<string, number>();
    var count = 0;
    var count1 = 0;

    // Initialize bin usage based on current inventory counts
    inventory.forEach(items => {
        items.forEach(item => {
            // if (!bins.has(item.srcbin)) {
            //     console.error(`Bin data missing for srcbin: ${item.srcbin}`);
            //     return;  // Ensure bin data is available before processing
            // }
            binUsage.set(item.srcbin, (binUsage.get(item.srcbin) || 0) + 1);
            if (!skuToBinItems.has(item.skuCode)) {
                skuToBinItems.set(item.skuCode, []);
            }
            skuToBinItems.get(item.skuCode).push(item);
        });
    });

    // Process each SKU group
    skuToBinItems.forEach((items, skuCode) => {
        // Sort bins within each SKU group
        items.sort((a, b) => (binUsage.get(a.srcbin) || 0) - (binUsage.get(b.srcbin) || 0));

        items.forEach(item => {
            const binCapacity = bins.get(item.srcbin)?.numPallets;
            const currentBinUsage = binUsage.get(item.srcbin);

            // Skip bins that already appear up to their numPallets limit
            if (currentBinUsage >= binCapacity) {
                return;
            }

            // Filter potential targets that meet batch closeness and capacity conditions
            const potentialTargets = items.filter(targetItem => {
                const batchYearDiff = batchYearCalc(item.batch, targetItem.batch);
                const targetBinUsage = binUsage.get(targetItem.srcbin) || 0;
                const targetBinCapacity = bins.get(targetItem.srcbin)?.numPallets || Infinity;

                return item.srcbin !== targetItem.srcbin && batchYearDiff <= 30 && targetBinUsage < targetBinCapacity;
            });

            // potentialTargets.sort((a, b) => (binUsage.get(b.srcbin) || 0) - (binUsage.get(a.srcbin) || 0));

            potentialTargets.sort((a, b) => {
                const usageDiffA = Math.abs(binUsage.get(a.srcbin)-bins.get(a.srcbin).numPallets);
                const usageDiffB = Math.abs(binUsage.get(b.srcbin)-bins.get(b.srcbin).numPallets);
            
                if (usageDiffA === usageDiffB) {
                    const sequenceDiffA = Math.abs((searchSequence.get(item.srcbin) || 0) - (searchSequence.get(a.srcbin) || 0));
                    const sequenceDiffB = Math.abs((searchSequence.get(item.srcbin) || 0) - (searchSequence.get(b.srcbin) || 0));
                    return sequenceDiffA - sequenceDiffB;
                }
            
                return (binUsage.get(b.srcbin) || 0) - (binUsage.get(a.srcbin) || 0);
            });            

            // Select the best target for consolidation
            if (potentialTargets.length > 0) {
                const target = potentialTargets[0];
                const combinedUsage = (binUsage.get(item.srcbin) || 0) + (binUsage.get(target.srcbin) || 0);

                if (binUsage.get(target.srcbin) === 0) {
                    return;
                }

                if (combinedUsage <= (bins.get(target.srcbin)?.numPallets)) {
                    results.push({
                        srcbin: item.srcbin,
                        huCode: item.huCode,
                        skuCode: item.skuCode,
                        batch: item.batch,
                        qty1: item.qty1,
                        destBin: target.srcbin 
                    });
                    // Update bin usages
                    binUsage.set(target.srcbin, combinedUsage); // Increment target bin usage
                    binUsage.set(item.srcbin, (binUsage.get(item.srcbin) || 0) - 1); // Decrement original bin usage if item is moved

                    // Check if the original bin is now empty
                    if ((binUsage.get(item.srcbin) || 0) <= 0) {
                        // console.log(`Bin ${item.binCode} is now empty.`);
                        count1+=1;
                    }
                    count += Math.abs(binUsage.get(item.srcbin)-bins.get(item.srcbin).numPallets);
                    // item.qty1 = 0;  // Mark the bin as fully moved
                }
            }
        });
    });
    console.log(`Empty Bins:`, count1);
    console.log(`Free Pallet Positions:`, count);

    return results.filter(item => item.destBin && item.destBin !== item.srcbin);
}


function exportToExcel(consolidatedItems: ConsolidatedInventory[], outputPath: string): void {
    const ws = XLSX.utils.json_to_sheet(consolidatedItems.map(item => ({
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

function main() {
    try {
        const inventoryData = loadExcelData('InventoryDump7.xlsx');
        const storageData = loadExcelData('StorageStructure.xlsx','Storage Bins');
        populateStorageBins(storageData);
        loadInventoryItems(inventoryData);
        const searchSequenceData = loadExcelData('SearchSequence.xlsx','Bin Search Table');
        populateSearchSequence(searchSequenceData);
        const consolidatedItems = consolidateInventory();
        exportToExcel(consolidatedItems, 'OutputwSS.xlsx');
    } catch (error) {
        console.error('Failed to process inventory data:', error);
    }
}

main();
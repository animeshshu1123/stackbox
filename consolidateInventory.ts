import { InventoryItem, Bin } from './dataProcessor'; 

export interface ConsolidatedInventory {
    srcbin: string;
    huCode: string;
    skuCode: number;
    batch: string;
    qty1: number;
    destBin: string;
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

function getTargetBinUsage(item: InventoryItem, targetItem: InventoryItem, binUsage: Map<string, number>, bins: Map<string, Bin>): boolean {
    const batchYearDiff = batchYearCalc(item.batch, targetItem.batch);
    const targetBinUsage = binUsage.get(targetItem.srcbin) || 0;
    const targetBinCapacity = bins.get(targetItem.srcbin)?.numPallets || Infinity;
    
    return (item.srcbin !== targetItem.srcbin && batchYearDiff <= 30 && targetBinUsage < targetBinCapacity);
}

function findPotentialTargets(items: InventoryItem[], item: InventoryItem, binUsage: Map<string, number>, bins: Map<string, Bin>): InventoryItem[] {
    return items.filter(target => getTargetBinUsage(item, target, binUsage, bins));
}

function findOptimalTarget(targets: InventoryItem[], binUsage: Map<string, number>, bins: Map<string, Bin>, item: InventoryItem, searchSequence: Map<string, number>): InventoryItem | undefined {
    return targets.sort((a, b) => {
        const usageDiffA = Math.abs(binUsage.get(a.srcbin)-bins.get(a.srcbin).numPallets);
        const usageDiffB = Math.abs(binUsage.get(b.srcbin)-bins.get(b.srcbin).numPallets);
            
        if (usageDiffA === usageDiffB) {
            const sequenceDiffA = Math.abs((searchSequence.get(item.srcbin) || 0) - (searchSequence.get(a.srcbin) || 0));
            const sequenceDiffB = Math.abs((searchSequence.get(item.srcbin) || 0) - (searchSequence.get(b.srcbin) || 0));
            return sequenceDiffA - sequenceDiffB;
        }
            
        return (binUsage.get(b.srcbin) || 0) - (binUsage.get(a.srcbin) || 0);
    })[0];     // Return the first item from the sorted array, assuming it's the best target
}


export function consolidateInventory(inventoryItems: Map<string, InventoryItem[]>, bins: Map<string, Bin>, searchSequence: Map<string, number>): ConsolidatedInventory[] {
    const results: ConsolidatedInventory[] = [];
    const binUsage = new Map<string, number>();
    const skuToBinItems = new Map<number, InventoryItem[]>();
    let emptyBinsCount = 0;
    let freePositionsCount = 0;

    inventoryItems.forEach(items => {
        items.forEach(item => {
            if (!skuToBinItems.has(item.skuCode)) {
                skuToBinItems.set(item.skuCode, []);
            }
            skuToBinItems.get(item.skuCode).push(item);
            binUsage.set(item.srcbin, (binUsage.get(item.srcbin) || 0) + 1);
        });
    });

    // Process each SKU group
    skuToBinItems.forEach((items, skuCode) => {
        items.sort((a, b) => (binUsage.get(a.srcbin) || 0) - (binUsage.get(b.srcbin) || 0));
        items.forEach(item => { 
            const binCapacity = bins.get(item.srcbin)?.numPallets;
            const currentBinUsage = binUsage.get(item.srcbin);

            // Skip bins that already appear up to their numPallets limit
            if (currentBinUsage >= binCapacity) {
                return;
            }
            
            const targets = findPotentialTargets(items, item, binUsage, bins);
            const target = findOptimalTarget(targets, binUsage, bins, item, searchSequence);

            if (target) {
                const combinedUsage = (binUsage.get(item.srcbin) || 0) + (binUsage.get(target.srcbin) || 0);

                if (binUsage.get(target.srcbin) === 0) {
                    return;
                }

                if (combinedUsage <= bins.get(target.srcbin)?.numPallets) {
                    results.push(createConsolidatedInventory(item, target.srcbin));
                    binUsage.set(target.srcbin, combinedUsage);
                    binUsage.set(item.srcbin, binUsage.get(item.srcbin) - 1);
                    emptyBinsCount += checkIfBinIsEmpty(binUsage, item.srcbin);
                    freePositionsCount += bins.get(item.srcbin)?.numPallets - binUsage.get(item.srcbin);
                }
            }
        });
    });

    console.log(`Empty Bins:`, emptyBinsCount);
    console.log(`Free Pallet Positions:`, freePositionsCount);

    return results.filter(item => item.destBin !== item.srcbin);
}

function updateBinUsage(binUsage: Map<string, number>, item: InventoryItem, increment: boolean): number {
    const currentUsage = binUsage.get(item.srcbin) || 0;
    binUsage.set(item.srcbin, increment ? currentUsage + 1 : currentUsage - 1);
    return binUsage.get(item.srcbin) || 0;
}

function checkIfBinIsEmpty(binUsage: Map<string, number>, srcbin: string): number {
    return (binUsage.get(srcbin) || 0) <= 0 ? 1 : 0;
}

function createConsolidatedInventory(item: InventoryItem, destBin: string): ConsolidatedInventory {
    return {
        srcbin: item.srcbin,
        huCode: item.huCode,
        skuCode: item.skuCode,
        batch: item.batch,
        qty1: item.qty1,
        destBin
    };
}



"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var XLSX = require("xlsx");
var bins = new Map();
var inventory = new Map();
var searchSequence = new Map();
function loadExcelData(filePath, sheetName) {
    var workbook = XLSX.readFile(filePath);
    var worksheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    var data = XLSX.utils.sheet_to_json(worksheet);
    console.log("Loaded ".concat(data.length, " rows from ").concat(filePath));
    return data;
}
function populateSearchSequence(searchSequenceData) {
    searchSequenceData.forEach(function (item) {
        var srcbin = item['Code'];
        var binType = item['Bucket (Good|Damaged)'];
        var sequence = parseInt(item['Search Sequence'], 10);
        if (binType === 'Good' && !isNaN(sequence)) {
            searchSequence.set(srcbin, sequence);
        }
    });
    console.log("Populated search sequences for ".concat(searchSequence.size, " bins."));
}
function populateStorageBins(storageData) {
    storageData.forEach(function (item) {
        var srcbin = item['Bin Code'];
        var binType = item['Bin Type'];
        if (!binType || binType.length === 0) {
            // console.error(`Bin type is undefined or invalid for bin code ${srcbin}`);
            return;
        }
        var match = binType.match(/\d+/);
        if (match) {
            var numPallets = parseInt(match[0], 10);
            if (!isNaN(numPallets)) {
                bins.set(srcbin, { srcbin: srcbin, numPallets: numPallets });
            }
            else {
                console.error("Extracted number of pallets is not valid for bin code ".concat(srcbin, ":"), match[0]);
            }
        }
        else {
            // console.error(`No digits found in bin type for bin code ${srcbin}`);
        }
    });
}
function loadInventoryItems(inventoryData) {
    inventoryData.forEach(function (item) {
        var _a;
        var status = item['Bin Status'];
        var lockStatus = item['LockStatus'];
        var quantity = parseInt(item['Quantity'], 10);
        var areaType = item['Area Type'];
        var qlty = item['Quality'];
        var LType = item['UOM'];
        if (status === 'ACTIVE' && areaType === 'INVENTORY' && LType === 'L2' && qlty === 'Good' &&
            lockStatus === 'FREE' && quantity > 0) {
            var srcbin = item['Bin Code'];
            var inventoryItem = {
                srcbin: srcbin,
                huCode: item['HU Code'],
                skuCode: parseInt(item['Sku Code'], 10),
                qty: parseFloat(item['Bin Occupancy %']),
                qty1: parseInt(item['Quantity'], 10),
                batch: item['Batch']
            };
            if (!inventory.has(srcbin)) {
                inventory.set(srcbin, []);
            }
            (_a = inventory.get(srcbin)) === null || _a === void 0 ? void 0 : _a.push(inventoryItem);
        }
    });
}
function batchYearCalc(batch1, batch2) {
    var firstDigit1 = batch1.charAt(0);
    var firstDigit2 = batch2.charAt(0);
    if (firstDigit1 === firstDigit2) {
        // Extract years from the batch strings and calculate normal difference
        var year1 = parseInt(batch1.substring(0, 4));
        var year2 = parseInt(batch2.substring(0, 4));
        return Math.abs(year1 - year2);
    }
    else {
        // Calculate difference based on the 2nd, 3rd, and 4th digits of each batch
        var nextThreeDigits1 = parseInt(batch1.substring(1, 4));
        var nextThreeDigits2 = parseInt(batch2.substring(1, 4));
        if (firstDigit1 < firstDigit2) {
            // Subtract the next three digits of the first batch from 365 and add the next three digits of the second batch
            return (365 - nextThreeDigits1) + nextThreeDigits2;
        }
        else {
            // Subtract the next three digits of the second batch from 365 and add the next three digits of the first batch
            return (365 - nextThreeDigits2) + nextThreeDigits1;
        }
    }
}
function consolidateInventory() {
    var results = [];
    var skuToBinItems = new Map();
    var binUsage = new Map();
    var count = 0;
    var count1 = 0;
    // Initialize bin usage based on current inventory counts
    inventory.forEach(function (items) {
        items.forEach(function (item) {
            binUsage.set(item.srcbin, (binUsage.get(item.srcbin) || 0) + 1);
            if (!skuToBinItems.has(item.skuCode)) {
                skuToBinItems.set(item.skuCode, []);
            }
            skuToBinItems.get(item.skuCode).push(item);
        });
    });
    // Process each SKU group
    skuToBinItems.forEach(function (items, skuCode) {
        // Sort bins within each SKU group
        items.sort(function (a, b) { return (binUsage.get(a.srcbin) || 0) - (binUsage.get(b.srcbin) || 0); });
        items.forEach(function (item) {
            var _a, _b;
            var binCapacity = (_a = bins.get(item.srcbin)) === null || _a === void 0 ? void 0 : _a.numPallets;
            var currentBinUsage = binUsage.get(item.srcbin);
            // Skip bins that already appear up to their numPallets limit
            if (currentBinUsage >= binCapacity) {
                return;
            }
            // Filter potential targets that meet batch closeness and capacity conditions
            var potentialTargets = items.filter(function (targetItem) {
                var _a;
                var batchYearDiff = batchYearCalc(item.batch, targetItem.batch);
                var targetBinUsage = binUsage.get(targetItem.srcbin) || 0;
                var targetBinCapacity = ((_a = bins.get(targetItem.srcbin)) === null || _a === void 0 ? void 0 : _a.numPallets) || Infinity;
                return item.srcbin !== targetItem.srcbin && batchYearDiff <= 30 && targetBinUsage < targetBinCapacity;
            });
            // potentialTargets.sort((a, b) => (binUsage.get(b.srcbin) || 0) - (binUsage.get(a.srcbin) || 0));
            potentialTargets.sort(function (a, b) {
                var usageDiffA = Math.abs(binUsage.get(a.srcbin) - bins.get(a.srcbin).numPallets);
                var usageDiffB = Math.abs(binUsage.get(b.srcbin) - bins.get(b.srcbin).numPallets);
                if (usageDiffA === usageDiffB) {
                    var sequenceDiffA = Math.abs((searchSequence.get(item.srcbin) || 0) - (searchSequence.get(a.srcbin) || 0));
                    var sequenceDiffB = Math.abs((searchSequence.get(item.srcbin) || 0) - (searchSequence.get(b.srcbin) || 0));
                    return sequenceDiffA - sequenceDiffB;
                }
                return (binUsage.get(b.srcbin) || 0) - (binUsage.get(a.srcbin) || 0);
            });
            // Select the best target for consolidation
            if (potentialTargets.length > 0) {
                var target = potentialTargets[0];
                var combinedUsage = (binUsage.get(item.srcbin) || 0) + (binUsage.get(target.srcbin) || 0);
                if (binUsage.get(target.srcbin) === 0) {
                    return;
                }
                if (combinedUsage <= ((_b = bins.get(target.srcbin)) === null || _b === void 0 ? void 0 : _b.numPallets)) {
                    results.push({
                        srcbin: item.srcbin,
                        huCode: item.huCode,
                        skuCode: item.skuCode,
                        batch: item.batch,
                        qty1: item.qty1,
                        destBin: target.srcbin
                    });
                }
            }
        });
    });
    console.log("Empty Bins:", count1);
    console.log("Free Pallet Positions:", count);
    return results.filter(function (item) { return item.destBin && item.destBin !== item.srcbin; });
}
function exportToExcel(consolidatedItems, outputPath) {
    var ws = XLSX.utils.json_to_sheet(consolidatedItems.map(function (item) { return ({
        "Bin Code": item.srcbin,
        "HU Code": item.huCode,
        "SKU Code": item.skuCode,
        "Batch": item.batch,
        "QTY": item.qty1,
        "TO BIN": item.destBin
    }); }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidated Results");
    XLSX.writeFile(wb, outputPath);
}
function main() {
    try {
        var inventoryData = loadExcelData('InventoryDump7.xlsx');
        var storageData = loadExcelData('StorageStructure.xlsx', 'Storage Bins');
        populateStorageBins(storageData);
        loadInventoryItems(inventoryData);
        var searchSequenceData = loadExcelData('SearchSequence.xlsx', 'Bin Search Table');
        populateSearchSequence(searchSequenceData);
        var consolidatedItems = consolidateInventory();
        exportToExcel(consolidatedItems, 'OutputwSS.xlsx');
    }
    catch (error) {
        console.error('Failed to process inventory data:', error);
    }
}
main();

import { loadAndProcessData } from './dataProcessor';
import { consolidateInventory } from './consolidateInventory'
import { exportToExcel } from './exportUtils';
import { config } from './config';

function main() {
    try {
        // This correctly captures bins and searchSequence from the returned object
        const { bins, inventoryItems, searchSequence } = loadAndProcessData(
            config.inventoryFilePath,
            config.storageFilePath,
            config.storageSheetName,
            config.searchSequenceFilePath,
            config.searchSequenceSheetName
        );

        // Now use bins and searchSequence as needed, for example:
        const consolidatedItems = consolidateInventory(inventoryItems, bins, searchSequence);
        exportToExcel(consolidatedItems, config.outputFilePath);
    } catch (error) {
        console.error('Failed to process inventory data:', error);
    }
}

main();


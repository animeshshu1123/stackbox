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
            config.searchSequenceSheetName,
            config.binFaceFilePath,
            config.binFaceSheetName
        );

        if (config.userChoice==='PALLET'){
            const consolidatedItems = consolidateInventory(inventoryItems, bins, searchSequence);
            exportToExcel(consolidatedItems, config.outputFilePath);
        }
        else{
            console.log('Wrong Choice');
        }
    } catch (error) {
        console.error('Failed to process inventory data:', error);
    }
}

main();


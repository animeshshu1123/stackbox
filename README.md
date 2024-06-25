BIN CONSOLIDATION PROCESS

Bin consolidation is a process designed to optimize the usage of storage space by merging the contents of multiple bins based on defined business rules. The objective is to reduce the number of bins used, thereby maximizing space utilization and reducing costs associated with excess storage space.

Objective:
Maximize the number of empty bins: Reduce the number of bins in use by consolidating items.
Ensure optimal bin usage: Do not exceed the bin's capacity, defined by the number of pallets it can hold.
Maintain batch integrity: Only merge items from batches that are close enough in expiry dates (within 30 days). This is checked using the first four digits of the batch number.

Inputs:
Inventory Dump: Details about each item stored, including bin code, SKU code, quantity, batch number, and the bin's total capacity.
Storage Bin Data: Information about each bin with its bintype code, including its capacity (number of pallets it can hold).
Pallet Best Fit: Shows the maximum quantity a SKU can be fit in a single pallet.

Steps in the Algorithm:

1. Load Data:
   - Load inventory items from the `InventoryDump.xlsx`.
   - Load bin capacities from the `StorageBins.xlsx`.
   - Load pallet best fit data from the `PalletBestFIt.xlsx`.

2. Filter the Data in Inventory Dump:
  Only keep those rows where 
Inclusion Status is INCLUDED
Bucket is GOOD
Status is ACTIVE
LockStatus is FREE
Quantity is more than zero

2. Initialize Data Structures:
   - Create a mapping (`skuToBinItems`) to group inventory items by SKU for easier comparison and access.
   - Initialize a usage map (`binUsage`) to track the current quantity of pallets in each bin.



3. Group Inventory by SKU:
   - Iterate through each inventory item.
   - Group items by their SKU codes into the `skuToBinItems` map.

4. Consolidate Inventory Steps:
   - For each group of items (grouped by SKU):
     - For each item in the group, compare it against other items with same SKU to find potential consolidation targets.
     - Check potential targets based on:
       - Batch closeness: The difference between the first four digits of their batches must not exceed 30 days.
       - Capacity constraints: The combined number of the items must not exceed the capacity of the target bin.
     - Update the `binUsage` map dynamically to reflect changes as items are consolidated.

5.  Adding `toBin`:
   - If two items are consolidated, select the target bin based on the bin that has greater bin occupancy.
   - The logic should also include movement from One Bin to Another should empty that old Bin

6. Result:
   - Compile a list of all consolidations made, indicating the original bin and the new target bin for each pallet.
   - Filter out any entries where the item was not moved to a new bin.

Output:
Consolidated Bins: A sheet  of all items that were moved, with their original bincode and the new consolidated bincode (“TO BIN”)



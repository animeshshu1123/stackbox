# **BIN CONSOLIDATION PROCESS**

Bin consolidation is a process designed to optimize the usage of storage space by merging the contents of multiple bins based on defined business rules. The objective is to reduce the number of bins used, thereby maximizing space utilization and reducing costs associated with excess storage space.

<br>

### Prerequisites

Before you begin, ensure you have the following installed:

- Node.js
- npm (Node Package Manager)

Run these commands in terminal to get the output: <br>

`npm install xlsx` <br>
`npx tsc main.ts` <br>
`node main.js`

<br>

### **Inputs:** <br>
- Inventory Dump: Details about each item stored, including bin code, SKU code, quantity, batch number, and the bin's total capacity. <br>
- Search Sequence Data: Information about each bin with its searchsequence value.
- config.ts: All the user inputs are to be put in this file.

<br>

### **Steps in the Algorithm:**

1. Load Data:
   - Load inventory items from the `InventoryDump.xlsx`.
   - Load searchSequence data from the `SearchSequence.xlsx`.

2. Filter the Data in Inventory Dump: 
  Only keep those rows where 
   - Inclusion Status is INCLUDED
   - Bucket is GOOD
   - Status is ACTIVE
   - LockStatus is FREE
   - Quantity is more than zero
   - If area codes are required
   - If zone codes are required
   - Face type is PICK

2. Initialize Data Structures:
   - Create a mapping (`inventory`) to group inventory items by SKU for easier comparison and access.
   - Initialize a usage map (`binUsage`) to track the current quantity of pallets in each bin.
   - Create a mapping (`serachSequence’`) to help select the target bin based on closest distance from source.
   - Create a mapping (`bins’`) to populate the max pallets allowed in each bin.

3. Group Inventory by SKU:
   - Iterate through each inventory item.
   - Group items by their SKU codes into the `inventory` map.

4. Consolidate Inventory Steps:
   - For each group of items (grouped by SKU):
     - For each item in the group, compare it against other items with same SKU to find potential consolidation targets.
     - Check potential targets based on:
       - Batch closeness: The difference between their batches must not exceed 30 days.
       - Capacity constraints: The combined number of the items must not exceed the capacity of the target bin.
     - Update the `binUsage` map dynamically to reflect changes as items are consolidated.

5. Adding `toBin`:
   - If two items are consolidated, select the target bin based on the bin that has greater bin occupancy, if same then use searchSequence map to find the same.
   - After movement, update the BinUsage for both source (-1) and target bins (+1).

6. Result: <br>
   - Compile a list of all consolidations made, indicating the original bin and the new target bin for each pallet.
   - Filter out any entries where the item was not moved to a new bin.
<br>

### **Output:** <br>
Consolidated Bins: A sheet of all items that were moved, with their original bincode and the new consolidated bincode (“TO BIN”)



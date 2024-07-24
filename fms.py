import pandas as pd
from openpyxl import load_workbook

def FMS(file_path):
    df = pd.read_excel(file_path)
    sku_counts = df['SKU'].value_counts().reset_index()
    total_rows = df.shape[0]
    sku_counts.columns = ['SKU', 'FREQ'] 
    sku_counts['CUMFREQ'] = sku_counts['FREQ'].cumsum()
    sku_counts['FREQ%'] = (sku_counts['FREQ'] / total_rows) * 100
    sku_counts['CUMFREQ%'] = (sku_counts['CUMFREQ'] / total_rows) * 100

    def fms_category(row):
        if row['CUMFREQ%'] < 70:
            return 'F'
        elif 70 <= row['CUMFREQ%'] < 90:
            return 'M'
        elif 90 <= row['CUMFREQ%'] <= 100:
            return 'S'
        else:
            return 'Undefined' 

    sku_counts['FMS'] = sku_counts.apply(fms_category, axis=1)
    
    return sku_counts

def ABC(file_path):
    df = pd.read_excel(file_path)

    sku_quantity_totals = df.groupby('SKU')['Ordered Qty'].sum().reset_index()
    sku_quantity_totals.columns = ['SKU', 'Quantity']
    total_quantity = df['Ordered Qty'].sum()
    sku_quantity_totals = sku_quantity_totals.sort_values('Quantity', ascending=False)

    sku_quantity_totals['CUMQuantity'] = sku_quantity_totals['Quantity'].cumsum()
    sku_quantity_totals['Quantity %'] = (sku_quantity_totals['Quantity'] / total_quantity) * 100
    sku_quantity_totals['Cumulative Quantity %'] = (sku_quantity_totals['CUMQuantity'] / total_quantity) * 100

    def abc_category(row):
        if row['Cumulative Quantity %'] < 70:
            return 'A'
        elif 70 <= row['Cumulative Quantity %'] < 90:
            return 'B'
        else:
            return 'C'

    sku_quantity_totals['ABC'] = sku_quantity_totals.apply(abc_category, axis=1)

    return sku_quantity_totals

def perform_vlookup_operations(file_path):

    df_abc = pd.read_excel(file_path, sheet_name='ABC Data')
    df_fms = pd.read_excel(file_path, sheet_name='FMS Data')

    fms_mapping = df_fms.set_index('SKU')['FMS'].to_dict()
    abc_mapping = df_abc.set_index('SKU')['ABC'].to_dict()

    df_abc['FMS'] = df_abc['SKU'].map(fms_mapping)
    df_fms['ABC'] = df_fms['SKU'].map(abc_mapping)

    df_abc['CLASS'] = df_abc['ABC'] + df_abc['FMS']
    df_fms['CLASS'] = df_fms['ABC'] + df_fms['FMS']

    with pd.ExcelWriter(file_path, mode='a', engine='openpyxl') as writer:
        book = writer.book     
        df_abc.to_excel(writer, sheet_name='Updated ABC Data', index=False)
        df_fms.to_excel(writer, sheet_name='Updated FMS Data', index=False)

file_path = 'Allocation Report.xlsx' 

result1 = FMS(file_path)
result2 = ABC(file_path)

with pd.ExcelWriter('ABCFMS.xlsx') as writer:
    result2.to_excel(writer, sheet_name='ABC Data', index=False)
    result1.to_excel(writer, sheet_name='FMS Data', index=False)

perform_vlookup_operations('ABCFMS.xlsx')
import pandas as pd

def load_and_process_fms(file_path):
    df = pd.read_excel(file_path)
    total_rows = df.shape[0]
    sku_counts = df['SKU'].value_counts().reset_index()
    sku_counts.columns = ['SKU', 'FREQ']
    sku_counts['CUMFREQ'] = sku_counts['FREQ'].cumsum()
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
    return sku_counts[['SKU', 'FMS']]

def load_and_process_abc(file_path):
    df = pd.read_excel(file_path)
    total_quantity = df['Ordered Qty'].sum()
    sku_quantity_totals = df.groupby('SKU')['Ordered Qty'].sum().reset_index()
    sku_quantity_totals.columns = ['SKU', 'Quantity']
    sku_quantity_totals = sku_quantity_totals.sort_values('Quantity', ascending=False)
    sku_quantity_totals['CUMQuantity'] = sku_quantity_totals['Quantity'].cumsum()
    sku_quantity_totals['Cumulative Quantity %'] = (sku_quantity_totals['CUMQuantity'] / total_quantity) * 100

    def abc_category(row):
        if row['Cumulative Quantity %'] < 70:
            return 'A'
        elif 70 <= row['Cumulative Quantity %'] < 90:
            return 'B'
        else:
            return 'C'

    sku_quantity_totals['ABC'] = sku_quantity_totals.apply(abc_category, axis=1)
    return sku_quantity_totals[['SKU', 'ABC']]

def combine_and_export_data(fms_data, abc_data, output_path):
    combined = pd.merge(fms_data, abc_data, on='SKU', how='outer')
    combined['CLASS'] = combined['ABC'].fillna('') + combined['FMS'].fillna('')

    combined = combined[['SKU', 'CLASS']]  # Keep only the required columns
    combined.to_excel(output_path, index=False, sheet_name='SKU and CLASS Data')

file_path = 'Allocation Report.xlsx'
fms_data = load_and_process_fms(file_path)
abc_data = load_and_process_abc(file_path)
combine_and_export_data(fms_data, abc_data, 'ABCxFMS.xlsx')

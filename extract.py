import pandas as pd
import PyPDF2
import os

resource_dir = '/Users/bytedance/Documents/Github/agent/producer/resource'

for f in os.listdir(resource_dir):
    path = os.path.join(resource_dir, f)
    print("="*40)
    print(f"FILE: {f}")
    if f.endswith('.xlsx') or f.endswith('.xls'):
        try:
            df = pd.read_excel(path, sheet_name=None)
            for sheet, data in df.items():
                print(f"--- Sheet: {sheet} ---")
                print(data.head(15).to_string())
        except Exception as e:
            print("Error reading excel:", e)
    elif f.endswith('.pdf'):
        try:
            with open(path, 'rb') as pdf_file:
                reader = PyPDF2.PdfReader(pdf_file)
                for i in range(min(5, len(reader.pages))):
                    print(reader.pages[i].extract_text())
        except Exception as e:
            print("Error reading pdf:", e)

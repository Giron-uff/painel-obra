import pandas as pd
import os

files = [
    "c:/Users/Giron/.gemini/antigravity/scratch/acompanhamento de obras/ERM - ENTREGÁVEIS GEN.xlsx",
    "c:/Users/Giron/.gemini/antigravity/scratch/acompanhamento de obras/Material Ivestimentos GIRON.xlsx"
]

for f in files:
    print(f"--- ANALYZING {os.path.basename(f)} ---")
    try:
        # Load the excel file
        xl = pd.ExcelFile(f)
        for sheet in xl.sheet_names:
            print(f"Sheet: {sheet}")
            df = xl.parse(sheet)
            print("Columns:", list(df.columns))
            print("First 3 rows:")
            print(df.head(3).to_string())
            print("\n")
    except Exception as e:
        print(f"Error reading {f}: {e}")

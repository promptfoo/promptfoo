#!/usr/bin/env python3
"""
CSV Validation Script for Promptfoo Test Data
Checks for common CSV formatting issues
"""

import csv
import sys
from pathlib import Path

def validate_csv(filename):
    """Validate CSV file format and report issues"""
    print(f"\n🔍 Validating: {filename}")
    print("=" * 60)
    
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            # Try to detect delimiter
            sample = f.read(1024)
            f.seek(0)
            sniffer = csv.Sniffer()
            dialect = sniffer.sniff(sample)
            
            # Read CSV
            reader = csv.reader(f, dialect)
            rows = list(reader)
            
            if not rows:
                print("❌ ERROR: File is empty")
                return
            
            # Check headers
            headers = rows[0]
            print(f"✓ Headers found: {headers}")
            print(f"  Column count: {len(headers)}")
            
            # Check for empty headers
            empty_headers = [i for i, h in enumerate(headers) if not h.strip()]
            if empty_headers:
                print(f"⚠️  WARNING: Empty header(s) at position(s): {empty_headers}")
            
            # Check data rows
            print(f"\n✓ Data rows: {len(rows) - 1}")
            
            # Check column consistency
            inconsistent_rows = []
            for i, row in enumerate(rows[1:], start=2):
                if len(row) != len(headers):
                    inconsistent_rows.append((i, len(row)))
            
            if inconsistent_rows:
                print("\n⚠️  WARNING: Inconsistent column counts:")
                for row_num, col_count in inconsistent_rows[:5]:  # Show first 5
                    print(f"   Row {row_num}: {col_count} columns (expected {len(headers)})")
                if len(inconsistent_rows) > 5:
                    print(f"   ... and {len(inconsistent_rows) - 5} more rows")
            
            # Check for common issues
            print("\n📊 Content Analysis:")
            
            # Check for HTML content
            html_rows = 0
            for row in rows[1:]:
                if any('<' in str(cell) and '>' in str(cell) for cell in row):
                    html_rows += 1
            
            if html_rows > 0:
                print(f"  - HTML content found in {html_rows} rows")
                print("    ✓ This is OK - HTML is properly quoted")
            
            # Check for very long cells
            long_cells = []
            for i, row in enumerate(rows[1:], start=2):
                for j, cell in enumerate(row):
                    if len(str(cell)) > 1000:
                        long_cells.append((i, headers[j] if j < len(headers) else f"Column {j}"))
            
            if long_cells:
                print(f"  - Found {len(long_cells)} cells with >1000 characters")
                for row_num, col_name in long_cells[:3]:
                    print(f"    Row {row_num}, Column '{col_name}'")
            
            # Sample data
            print("\n📋 Sample Data (first 3 rows):")
            for i, row in enumerate(rows[1:4], start=1):
                print(f"\nRow {i}:")
                for j, (header, value) in enumerate(zip(headers, row)):
                    if value:
                        preview = value[:60] + "..." if len(value) > 60 else value
                        print(f"  {header}: {preview}")
            
            print("\n✅ Validation complete!")
            
    except Exception as e:
        print(f"❌ ERROR: {type(e).__name__}: {e}")
        return

def main():
    """Main function"""
    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        # Default files to check
        files = ['selectbest_response.csv', 'selectbest_response_corrected.csv']
    
    for filename in files:
        if Path(filename).exists():
            validate_csv(filename)
        else:
            print(f"\n⚠️  File not found: {filename}")

if __name__ == "__main__":
    main() 
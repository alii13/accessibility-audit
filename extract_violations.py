#!/usr/bin/env python3
"""
Extract all violations except nested interactive elements into a single CSV file.
"""
import os
import csv
import glob

def read_csv_file(filepath):
    """Read a CSV file and return its rows, skipping metadata lines until 'Rule ID' header."""
    rows = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header_found = False
            for row in reader:
                # Skip empty rows
                if not any(cell.strip() for cell in row):
                    continue
                
                # Look for the actual header row that contains "Rule ID"
                # Check if any cell in the row contains "Rule ID"
                if not header_found:
                    if any('Rule ID' in str(cell) for cell in row):
                        header_found = True
                        rows.append(row)  # Include the header row
                    # Skip all rows until we find the header
                    continue
                # After header is found, include all data rows
                rows.append(row)
    except Exception as e:
        print(f"  Error reading file: {e}")
        return []
    return rows

def extract_violations(results_dir='results', output_file='all_violations_except_nested_interactive.csv'):
    """Extract all violations except nested interactive elements."""
    csv_files = glob.glob(os.path.join(results_dir, '*.csv'))
    
    # Exclude generated files from being processed
    excluded_files = ['all_violations_except_nested_interactive.csv', 'combined_accessibility_results.xlsx']
    csv_files = [f for f in csv_files if os.path.basename(f) not in excluded_files]
    
    if not csv_files:
        print(f"No CSV files found in {results_dir}")
        return
    
    print(f"Found {len(csv_files)} CSV file(s) to process")
    
    all_violations = []
    headers_written = False
    
    for csv_file in sorted(csv_files):
        filename = os.path.basename(csv_file)
        print(f"Processing {filename}...")
        
        rows = read_csv_file(csv_file)
        
        if not rows:
            print(f"  Skipping {filename} - no rows found")
            continue
        
        if len(rows) < 2:  # Need at least header + 1 data row
            print(f"  Skipping {filename} - no violation data (only header found)")
            continue
        
        header = rows[0]
        
        # Find the index of relevant columns
        rule_id_idx = None
        try:
            rule_id_idx = header.index('Rule ID')
            description_idx = header.index('Description') if 'Description' in header else None
        except ValueError:
            # Try to find 'Rule ID' with case-insensitive or partial match
            for i, cell in enumerate(header):
                cell_str = str(cell).lower()
                if 'rule' in cell_str and 'id' in cell_str:
                    rule_id_idx = i
                    break
            
            if rule_id_idx is None:
                print(f"  Skipping {filename} - missing 'Rule ID' column (header columns: {', '.join(header[:5])}...)")
                continue
        
        # Write header once
        if not headers_written:
            header_with_source = ['Source File'] + header
            all_violations.append(header_with_source)
            headers_written = True
        
        # Process data rows
        for row in rows[1:]:
            if len(row) <= rule_id_idx:
                continue
            
            rule_id = row[rule_id_idx].strip() if rule_id_idx < len(row) else ''
            
            # Skip nested interactive elements
            # Common rule IDs for nested interactive: 'nested_interactive', 'nestedbutton', etc.
            if rule_id and 'nested' in rule_id.lower() and 'interactive' in rule_id.lower():
                continue
            
            # Add source file and include the row
            violation_row = [filename] + row
            all_violations.append(violation_row)
    
    # Write to output file
    if all_violations:
        output_path = os.path.join(results_dir, output_file)
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(all_violations)
        
        violation_count = len(all_violations) - 1  # Subtract header
        print(f"Extracted {violation_count} violations (excluding nested interactive)")
        print(f"Results saved to: {output_path}")
    else:
        print("No violations found to extract")

if __name__ == '__main__':
    import sys
    results_dir = sys.argv[1] if len(sys.argv) > 1 else 'results'
    extract_violations(results_dir)


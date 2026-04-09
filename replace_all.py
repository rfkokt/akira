import os
import re

directory = '/Volumes/External M4/Project/ars-ai/akira/src'

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    
    # 3. Remove all font-geist instances
    # Handle single class
    content = re.sub(r'className="font-geist"', '', content)
    # Handle at the start
    content = re.sub(r'className="font-geist ', 'className="', content)
    # Handle in the middle or end
    content = re.sub(r'\s+font-geist\b', '', content)
    content = re.sub(r'\bfont-geist\s+', '', content)
    
    # Handle template literals and clsx/cn
    content = re.sub(r"`font-geist`", "``", content)
    content = re.sub(r"'font-geist'", "''", content)
    content = re.sub(r'"font-geist"', '""', content)

    # 4. Global find-replace: text-[9px] -> text-2xs, text-[10px] -> text-xs
    content = content.replace('text-[9px]', 'text-2xs')
    content = content.replace('text-[10px]', 'text-xs')

    if original != content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith(('.tsx', '.ts', '.jsx', '.js', '.html')):
            process_file(os.path.join(root, file))

print("Done")

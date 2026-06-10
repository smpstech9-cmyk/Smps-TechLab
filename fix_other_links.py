import os
import re

directory = r"c:\Users\csvan\OneDrive\Desktop\smps\project-root"

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        
        # Remove 'project-root/' from href attributes
        content = re.sub(r'href="project-root/([^"]+)"', r'href="\1"', content)
        
        # Remove '../' from href attributes (just in case)
        content = re.sub(r'href="\.\./([^"]+)"', r'href="\1"', content)
        
        if content != original_content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Updated links in {filename}")

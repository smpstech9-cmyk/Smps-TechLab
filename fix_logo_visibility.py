import os
import re

directory = r"c:\Users\csvan\OneDrive\Desktop\smps\project-root"

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        
        # Replace the style string in the logo image tag
        old_style = 'style="object-fit:cover; background:none; border:none;"'
        new_style = 'style="object-fit:contain; background:none; border:none; border-radius:0; width:auto; height:50px;"'
        
        content = content.replace(old_style, new_style)
        
        if content != original_content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Updated logo visibility in {filename}")

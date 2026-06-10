import os
import re

directory = r"c:\Users\csvan\OneDrive\Desktop\smps\project-root"

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        
        # Replace <div class="logo-icon">ST</div> with image
        # Match <div class="logo-icon"...>ST</div>
        # Keep any additional attributes or styles
        content = re.sub(
            r'<div class="logo-icon"([^>]*)>\s*ST\s*</div>',
            r'<img src="assets/ruf/main%201.jpeg" class="logo-icon"\1 style="object-fit:cover; background:none; border:none;" alt="Logo">',
            content
        )
        
        if content != original_content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Added logo to {filename}")

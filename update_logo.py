import os
import re

directory = r"c:\Users\csvan\OneDrive\Desktop\smps\project-root"

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        
        # Replace the src of the logo image
        # The current src is 'assets/ruf/main%201.jpeg'
        # We need to change it to 'assets/ruf/main%201%20rem.jpg'
        
        content = content.replace('assets/ruf/main%201.jpeg', 'assets/ruf/main%201%20rem.jpg')
        
        if content != original_content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Updated logo to main 1 rem.jpg in {filename}")

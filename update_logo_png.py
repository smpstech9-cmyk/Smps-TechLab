import os

directory = r"c:\Users\csvan\OneDrive\Desktop\smps\project-root"

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        
        # Replace .jpg with .png for the logo
        content = content.replace('assets/ruf/main%201%20rem.jpg', 'assets/ruf/main%201%20rem.png')
        content = content.replace('assets/ruf/main 1 rem.jpg', 'assets/ruf/main%201%20rem.png')
        
        if content != original_content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Updated logo to .png in {filename}")

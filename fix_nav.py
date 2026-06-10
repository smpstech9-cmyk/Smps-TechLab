import os
import re

directory = r"c:\Users\csvan\OneDrive\Desktop\smps\project-root"

links = [
    ("index.html", "Home"),
    ("about.html", "About"),
    ("products.html", "Products"),
    ("ip-portfolio.html", "IP Portfolio"),
    ("collaborate.html", "Collaborate"),
    ("careers.html", "Careers"),
    ("execom.html", "Execom"),
    ("events.html", "Events"),
    ("gallery.html", "Gallery"),
    ("contact.html", "Contact")
]

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        
        # 1. Fix the logo link
        content = re.sub(
            r'<a href="[^"]*" class="logo">',
            r'<a href="index.html" class="logo">',
            content
        )
        
        # 2. Fix the CTA link
        content = re.sub(
            r'<a href="[^"]*" class="nav-cta">Get In Touch →</a>',
            r'<a href="contact.html" class="nav-cta">Get In Touch →</a>',
            content
        )

        # 3. Fix nav-links and mobile-menu
        def replace_links(match):
            class_name = match.group(1)
            id_str = match.group(2) if match.group(2) else ""
            
            new_links = []
            for url, text in links:
                is_active = (url == filename)
                active_str = ' class="active"' if is_active else ''
                new_links.append(f'<a href="{url}"{active_str}>{text}</a>')
            
            if "mobile-menu" in class_name:
                links_str = "\n        ".join(new_links)
                return f'<div class="{class_name}"{id_str}>\n        {links_str}\n    </div>'
            else:
                links_str = "\n                ".join(new_links)
                return f'<div class="{class_name}"{id_str}>\n                {links_str}\n            </div>'
        
        # For nav-links
        content = re.sub(
            r'<div class="(nav-links)"()>\s*(?:<a\s+[^>]*>.*?</a>\s*)+</div>',
            replace_links,
            content,
            flags=re.DOTALL | re.IGNORECASE
        )
        
        # For mobile-menu
        content = re.sub(
            r'<div class="(mobile-menu)"( id="mob")>\s*(?:<a\s+[^>]*>.*?</a>\s*)+</div>',
            replace_links,
            content,
            flags=re.DOTALL | re.IGNORECASE
        )
        
        if content != original_content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Updated {filename}")

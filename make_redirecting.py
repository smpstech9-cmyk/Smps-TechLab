import re

filepath = r"c:\Users\csvan\OneDrive\Desktop\smps\project-root\index.html"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add .link-card to CSS if not exists
if ".link-card" not in content:
    css_to_add = """
        .link-card {
            text-decoration: none !important;
            color: inherit !important;
            display: block;
            cursor: pointer;
        }
"""
    content = content.replace("/* REVEAL ANIMATIONS */", css_to_add + "        /* REVEAL ANIMATIONS */")

# We want to replace <div class="card"> ... </div> with <a href="..." class="card link-card"> ... </a>
# We can do this by finding the sections and doing local replacements.

# About Section Cards -> about.html
about_match = re.search(r'<div class="about-cards reveal">.*?(?=<!-- PRODUCTS -->)', content, re.DOTALL)
if about_match:
    about_sec = about_match.group(0)
    # Replace div with a
    new_about = re.sub(r'<div class="card">', r'<a href="about.html" class="card link-card">', about_sec)
    new_about = new_about.replace('</div>\n                    <div class="card">', '</a>\n                    <a href="about.html" class="card link-card">')
    # we need to replace the closing </div> of each card to </a>
    # A simple regex for the card:
    new_about = re.sub(r'(<a href="about\.html" class="card link-card">.*?)</p>\n                    </div>', r'\1</p>\n                    </a>', new_about, flags=re.DOTALL)
    content = content.replace(about_sec, new_about)

# Collaborate Section Cards -> collaborate.html
collab_match = re.search(r'<!-- COLLABORATIONS -->.*?(?=<!-- TESTIMONIALS -->)', content, re.DOTALL)
if collab_match:
    collab_sec = collab_match.group(0)
    new_collab = re.sub(r'<div class="card">', r'<a href="collaborate.html" class="card link-card">', collab_sec)
    new_collab = re.sub(r'(<a href="collaborate\.html" class="card link-card">.*?)</p>\n                </div>', r'\1</p>\n                </a>', new_collab, flags=re.DOTALL)
    content = content.replace(collab_sec, new_collab)

# IP Portfolio Cards -> ip-portfolio.html
ip_match = re.search(r'<!-- IP PORTFOLIO PREVIEW -->.*?(?=<!-- COLLABORATIONS -->)', content, re.DOTALL)
if ip_match:
    ip_sec = ip_match.group(0)
    new_ip = re.sub(r'<div class="ip-card reveal">', r'<a href="ip-portfolio.html" class="ip-card reveal link-card">', ip_sec)
    new_ip = re.sub(r'(<a href="ip-portfolio\.html" class="ip-card reveal link-card">.*?)</p>\n                </div>', r'\1</p>\n                </a>', new_ip, flags=re.DOTALL)
    content = content.replace(ip_sec, new_ip)

# News/Events Cards -> events.html
news_match = re.search(r'<!-- NEWS & EVENTS -->.*?(?=<!-- FOOTER -->)', content, re.DOTALL)
if news_match:
    news_sec = news_match.group(0)
    new_news = re.sub(r'<div class="news-card reveal">', r'<a href="events.html" class="news-card reveal link-card">', news_sec)
    new_news = re.sub(r'(<a href="events\.html" class="news-card reveal link-card">.*?)</p>\n                    </div>\n                </div>', r'\1</p>\n                    </div>\n                </a>', new_news, flags=re.DOTALL)
    content = content.replace(news_sec, new_news)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Home page updated.")

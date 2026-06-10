import sqlite3
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, 'smps.db')
DEFAULTS_JSON = '/Users/shivabhakle/.gemini/antigravity-ide/scratch/parsed_defaults.json'

def seed_db():
    print(f"Connecting to database at {DB_FILE}...")
    if not os.path.exists(DEFAULTS_JSON):
        print(f"Error: Defaults JSON file not found at {DEFAULTS_JSON}")
        return

    with open(DEFAULTS_JSON, 'r') as f:
        data = json.load(f)

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # 1. Products
    print("Seeding products...")
    c.execute("DELETE FROM products")
    products = data.get('defaultProducts', [])
    for p in products:
        c.execute('''
            INSERT INTO products (id, name, tag, status, icon, img, imgClass, tagClass, tagLabel, desc, fullDesc, features)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            p.get('id'), p.get('name'), p.get('tag'), p.get('status'), p.get('icon'),
            p.get('img'), p.get('imgClass'), p.get('tagClass'), p.get('tagLabel'), 
            p.get('desc'), p.get('fullDesc'), json.dumps(p.get('features', []))
        ))

    # 2. Execom & Advisors
    print("Seeding execom & advisors...")
    c.execute("DELETE FROM execom")
    members = []
    for m in members:
        c.execute('''
            INSERT INTO execom (id, name, role, type, initials, img, expertise, bio, quote, achievements, linkedin, email)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            m.get('id'), m.get('name'), m.get('role'), 'execom', m.get('initials'),
            m.get('img'), m.get('expertise'), m.get('bio'), m.get('quote'),
            json.dumps(m.get('achievements', [])), m.get('linkedin'), m.get('email')
        ))

    advisors = []
    for a in advisors:
        c.execute('''
            INSERT INTO execom (id, name, role, type, initials, img, expertise, bio, quote, achievements, linkedin, email)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            # Add an offset to advisor IDs or keep them as is (type is advisor, IDs don't overlap in initial commit)
            a.get('id') + 100, a.get('name'), a.get('role'), 'advisor', a.get('initials'),
            a.get('img', ''), a.get('expertise'), a.get('bio'), a.get('quote'),
            json.dumps(a.get('achievements', [])), a.get('linkedin', ''), a.get('email', '')
        ))

    # 3. Events
    print("Seeding events...")
    c.execute("DELETE FROM events")
    events = []
    for e in events:
        c.execute('''
            INSERT INTO events (id, name, type, date, month, day, location, img, desc, fullDesc, speakers, agenda, prerequisites, seats, is_featured)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            e.get('id'), e.get('name'), e.get('type'), e.get('date'), e.get('month'),
            e.get('day'), e.get('location'), e.get('img'), e.get('desc'),
            e.get('fullDesc'), json.dumps(e.get('speakers', [])), e.get('agenda', ''),
            e.get('prerequisites', ''), e.get('seats', ''), 1 if e.get('is_featured') else 0
        ))

    # 4. Gallery
    print("Seeding gallery...")
    c.execute("DELETE FROM gallery")
    gallery = data.get('defaultGalleryData', [])
    for g in gallery:
        c.execute('''
            INSERT INTO gallery (id, category, title, desc, img)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            g.get('id'), g.get('category'), g.get('title'), g.get('desc'), g.get('img')
        ))

    # 5. Patents
    print("Seeding patents...")
    c.execute("DELETE FROM patents")
    patents = data.get('defaultPatents', [])
    for idx, p in enumerate(patents, start=1):
        # Convert string ID like 'S-2024-001' to integer index for SQLite compat
        c.execute('''
            INSERT INTO patents (id, type, typeLabel, year, title, desc, tags, status, statusLabel)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            idx, p.get('type'), p.get('typeLabel'), p.get('year'), p.get('title'),
            p.get('desc'), json.dumps(p.get('tags', [])), p.get('status'), p.get('statusLabel')
        ))

    # 6. Research
    print("Seeding research...")
    c.execute("DELETE FROM research")
    research = data.get('defaultResearch', [])
    for idx, r in enumerate(research, start=1):
        c.execute('''
            INSERT INTO research (id, icon, title, desc, year, journal, impactFactor)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            idx, r.get('icon'), r.get('title'), r.get('desc'), r.get('year'),
            r.get('journal'), r.get('impactFactor')
        ))

    # 7. Licensing
    print("Seeding licensing...")
    c.execute("DELETE FROM licensing")
    licensing = data.get('defaultLicensing', [])
    for idx, l in enumerate(licensing, start=1):
        c.execute('''
            INSERT INTO licensing (id, icon, title, desc)
            VALUES (?, ?, ?, ?)
        ''', (
            idx, l.get('icon'), l.get('title'), l.get('desc')
        ))

    # 8. IP Settings
    print("Seeding IP settings...")
    c.execute("DELETE FROM ip_settings")
    ip_settings = data.get('defaultIpSettings', {})
    for k, v in ip_settings.items():
        c.execute('''
            INSERT INTO ip_settings (key, value)
            VALUES (?, ?)
        ''', (k, str(v)))

    # 9. Site Settings
    print("Seeding site settings...")
    c.execute("DELETE FROM site_settings")
    
    settings_map = {
        'execomSettings': data.get('defaultExecomSettings'),
        'eventsSettings': data.get('defaultEventsSettings'),
        'gallerySettings': data.get('defaultGallerySettings'),
        'productsSettings': data.get('defaultProductsSettings'),
        'aboutData': data.get('defaultAboutData'),
        'collabData': data.get('defaultCollabSettings'),
        'homeData': data.get('defaultHome')
    }

    for key, val in settings_map.items():
        if val:
            val_str = json.dumps(val)
            c.execute('''
                INSERT INTO site_settings (key, value)
                VALUES (?, ?)
            ''', (key, val_str))

    conn.commit()
    conn.close()
    print("Successfully seeded all tables in SQLite database!")

if __name__ == '__main__':
    seed_db()

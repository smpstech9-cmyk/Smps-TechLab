import os
import sys

def replace_port(root_dir):
    old = 'http://127.0.0.1:5001'
    new = ''  # use relative URLs
    for dirpath, _, filenames in os.walk(root_dir):
        for fname in filenames:
            if fname.endswith(('.html', '.js')):
                fpath = os.path.join(dirpath, fname)
                try:
                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                except Exception as e:
                    print(f'Failed to read {fpath}: {e}')
                    continue
                if old in content:
                    new_content = content.replace(old, new)
                    with open(fpath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f'Updated {fpath}')

if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    replace_port(root)

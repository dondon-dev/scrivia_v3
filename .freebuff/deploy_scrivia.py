"""Upload frontend/dist (packaged in deploy-scriviapayroll.zip) to the
scriviapayroll.com web root over SFTP.

The zip is extracted locally, then every file is mirrored to the remote web
root with paramiko. Existing files are overwritten; the previous index.html is
backed up as index.html.bak-<timestamp> before being replaced.

Usage:
  SSH_PASS='...' python deploy_scrivia.py [--root /home/u403046506/domains/scriviapayroll.com/public_html]
"""
import io
import os
import stat
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ssh_tool"))

HOST = "217.21.72.255"
PORT = 65002
USER = "u403046506"
ZIP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "deploy-scriviapayroll.zip")
FORCE_ROOT = os.environ.get("DEPLOY_ROOT") or None
for i, a in enumerate(sys.argv):
    if a == "--root" and i + 1 < len(sys.argv):
        FORCE_ROOT = sys.argv[i + 1]

import paramiko  # noqa: E402

PASSWORD = os.environ.get("SSH_PASS", "")
if not PASSWORD:
    sys.exit("SSH_PASS env var not set")


def sftp_exists(sftp, path):
    try:
        sftp.stat(path)
        return True
    except FileNotFoundError:
        return False


def sftp_is_dir(sftp, path):
    try:
        return stat.S_ISDIR(sftp.stat(path).st_mode)
    except FileNotFoundError:
        return False


def walk_candidates(sftp, base, depth, out):
    """Collect dirs up to `depth` levels under base (SFTP)."""
    if depth < 0:
        return
    try:
        names = sftp.listdir(base)
    except FileNotFoundError:
        return
    for n in names:
        if n.startswith("."):
            continue
        p = base + "/" + n
        if sftp_is_dir(sftp, p):
            out.append(p)
            walk_candidates(sftp, p, depth - 1, out)


def looks_like_app_root(sftp, path):
    idx = path + "/index.html"
    if not sftp_exists(sftp, idx):
        return False
    try:
        with sftp.open(idx, "rb") as f:
            head = f.read(4096).decode("utf-8", "replace")
    except Exception:
        return False
    return "assets/" in head and ("scrivia" in head.lower() or "payroll" in head.lower() or "assets/index-" in head)


def find_web_root(sftp, home):
    cands = []
    walk_candidates(sftp, home, 2, cands)
    hits = []
    for c in cands:
        if looks_like_app_root(sftp, c):
            hits.append(c)
    if not hits:
        return None
    # Prefer an explicit scriviapayroll domain path; else the shallowest dir.
    named = [h for h in hits if "scriviapayroll" in h.lower()]
    pool = named or hits
    pool.sort(key=lambda h: h.count("/"))
    return pool[0]


def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=25, banner_timeout=25, auth_timeout=25)
    sftp = cli.open_sftp()

    home = sftp.normalize(".")
    root = FORCE_ROOT
    if not root:
        root = find_web_root(sftp, home)
        if not root:
            print("ROOT-SCAN:", [p for p in []])
            # dump top-level listing for diagnosis
            print("HOME LIST:", sftp.listdir(home))
            sys.exit("Could not auto-detect the web root; pass --root <path>")
    print("WEB ROOT:", root)

    # Backup current index.html
    if sftp_exists(sftp, root + "/index.html"):
        try:
            with sftp.open(root + "/index.html", "rb") as f:
                cur = f.read()
            import datetime
            stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
            bak = root + "/index.html.bak-" + stamp
            with sftp.open(bak, "wb") as f:
                f.write(cur)
            print("BACKUP:", bak, len(cur), "bytes")
        except Exception as e:
            print("backup failed (continuing):", e)

    entries = []
    with zipfile.ZipFile(ZIP) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/"):
                print("skip unsafe:", name)
                continue
            entries.append((name, z.read(info)))

    print("Uploading", len(entries), "files from", os.path.basename(ZIP))
    made = 0
    for name, data in entries:
        remote = root + "/" + name
        parts = remote.split("/")
        # mkdir -p
        cur = ""
        for part in parts[:-1]:
            cur += part + "/" if part else ""
            if not cur:
                continue
            if not sftp_exists(sftp, cur.rstrip("/")):
                try:
                    sftp.mkdir(cur.rstrip("/"))
                    made += 1
                except OSError:
                    pass
        with sftp.open(remote, "wb") as f:
            f.write(data)
    print("uploaded; dirs created:", made)

    # Verify a couple of markers on the server
    for probe in ["index.html", "PAL.xlsx", "assets/PlantillaAllocationList-DkgFRuwS.js"]:
        p = root + "/" + probe
        print("VERIFY", probe, "->", "OK" if sftp_exists(sftp, p) else "MISSING")

    sftp.close()
    cli.close()
    print("DONE")


if __name__ == "__main__":
    main()

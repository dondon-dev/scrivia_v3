"""Upload frontend/dist to the scriviapayroll.com web root over SFTP (Hostinger).

Usage:
  python deploy_hostinger_sftp.py [--root /home/u403046506/domains/scriviapayroll.com/public_html] [--dry-run]
                                   [--dist frontend/dist_live] [--force]

  The password is read from SSH_PASS, which is auto-loaded from the gitignored .env
  at the repo root (override the path with DEPLOY_ENV_FILE, or just export SSH_PASS).
  A real environment variable always wins over the .env value.

  The upload source defaults to frontend/dist (or DEPLOY_DIST). Pass --dist when
  that folder is unusable - e.g. a stale entry that Windows reports as
  "corrupted and unreadable" makes vite's emptyOutDir step fail; build to a
  clean folder instead: npx vite build --outDir dist_live --emptyOutDir

Behaviour:
  - Connects to 217.21.72.255:65002 as u403046506 with the SSH_PASS password.
  - Auto-detects the web root (dir containing index.html with assets/ + scrivia/payroll markers),
    preferring paths containing 'scriviapayroll', unless --root / $env:DEPLOY_ROOT given.
    On Git Bash use DEPLOY_ROOT=/home/... (env vars are not path-mangled); a --root value
    that arrives as C:/Program Files/Git/... is rejected instead of uploading to a junk tree.
  - Backs up remote index.html to index.html.bak-<timestamp> before replacing.
  - Mirrors the local dist folder recursively: creates dirs, uploads changed files and
    leaves equal-size files alone (pass --force to re-upload everything).
  - Verifies index.html + entry bundle afterwards and prints DONE.
"""
import datetime
import os
import stat
import sys

HOST = "217.21.72.255"
PORT = 65002
USER = "u403046506"
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIST = os.path.join(REPO_DIR, "frontend", "dist")

FORCE_ROOT = os.environ.get("DEPLOY_ROOT") or None
FORCE_DIST = os.environ.get("DEPLOY_DIST") or None
DRY_RUN = False
FORCE_UPLOAD = False
for i, a in enumerate(sys.argv):
    if a == "--root" and i + 1 < len(sys.argv):
        FORCE_ROOT = sys.argv[i + 1]
    if a == "--dist" and i + 1 < len(sys.argv):
        FORCE_DIST = sys.argv[i + 1]
    if a == "--dry-run":
        DRY_RUN = True
    if a == "--force":
        FORCE_UPLOAD = True



try:
    import paramiko
except ImportError:
    sys.exit("paramiko not installed (pip install paramiko)")


def load_env_file(path):
    """Load KEY=VALUE pairs from a dotenv file into os.environ (real env wins)."""
    if not os.path.isfile(path):
        return
    with open(path, "r", encoding="utf-8-sig") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key.startswith("export "):
                key = key[len("export "):].strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            if key:
                os.environ.setdefault(key, value)


ENV_FILE = os.environ.get("DEPLOY_ENV_FILE") or os.path.join(REPO_DIR, ".env")
load_env_file(ENV_FILE)

# Resolved after the .env load so DEPLOY_DIST can come from there too.
# argv --dist wins over DEPLOY_DIST, which wins over the frontend/dist default.
LOCAL_DIST = os.path.abspath(FORCE_DIST or os.environ.get("DEPLOY_DIST") or DEFAULT_DIST)

PASSWORD = os.environ.get("SSH_PASS", "")
if not PASSWORD and not DRY_RUN:
    sys.exit("SSH_PASS not set; add it to " + ENV_FILE + " (gitignored) or export it")


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


def sftp_size(sftp, path):
    try:
        return sftp.stat(path).st_size
    except FileNotFoundError:
        return None


def walk_candidates(sftp, base, depth, out):
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
    hits = [c for c in cands if looks_like_app_root(sftp, c)]
    if not hits:
        return None
    named = [h for h in hits if "scriviapayroll" in h.lower()]
    pool = named or hits
    pool.sort(key=lambda h: h.count("/"))
    return pool[0]


def collect_local_files(root):
    out = []
    for dirpath, _dirs, files in os.walk(root):
        for fn in files:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace("\\", "/")
            out.append((rel, full))
    return out


def main():
    if not os.path.isfile(os.path.join(LOCAL_DIST, "index.html")):
        sys.exit("No build to publish: " + LOCAL_DIST + "/index.html is missing.\n"
                 "Build first:  cd frontend && npx vite build --outDir dist_live --emptyOutDir\n"
                 "then re-run with --dist frontend/dist_live")
    local_files = collect_local_files(LOCAL_DIST)
    # Publish index.html LAST: it is the pointer to the new hashed bundles, so
    # switching it only after every asset is up keeps the live site from
    # referencing chunks that are still in flight.
    local_files.sort(key=lambda item: item[0] == "index.html")
    print("LOCAL:", LOCAL_DIST, "-", len(local_files), "files")
    sys.stdout.flush()
    if DRY_RUN:
        for rel, _ in local_files[:20]:
            print("  would upload:", rel)
        print("DRY-RUN DONE")
        return

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=PASSWORD,
                timeout=25, banner_timeout=25, auth_timeout=25)
    sftp = cli.open_sftp()

    home = sftp.normalize(".")
    print("HOME:", home)
    root = FORCE_ROOT or find_web_root(sftp, home)
    if not root:
        print("HOME LIST:", sftp.listdir(home))
        sys.exit("Could not auto-detect the web root; re-run with --root <path>")
    if not sftp_is_dir(sftp, root):
        print("HOME LIST:", sftp.listdir(home))
        sys.exit("Web root is not an existing directory: " + root)
    if not str(root).startswith("/"):
        # Git Bash rewrites POSIX-looking argv paths into C:/Program Files/Git/...
        # which SFTP then resolves *relative* to the home dir, quietly creating a
        # junk tree instead of publishing. Refuse rather than upload there.
        sys.exit("Refusing to deploy: remote root must be an absolute POSIX path, got "
                 + str(root) + "\nIf Git Bash mangled --root, pass it as DEPLOY_ROOT=... "
                 "or run with MSYS_NO_PATHCONV=1")
    print("WEB ROOT:", root)

    if sftp_exists(sftp, root + "/index.html"):
        try:
            with sftp.open(root + "/index.html", "rb") as f:
                cur = f.read()
            stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
            bak = root + "/index.html.bak-" + stamp
            with sftp.open(bak, "wb") as f:
                f.write(cur)
            print("BACKUP:", bak, len(cur), "bytes")
        except Exception as e:
            print("backup failed (continuing):", e)

    # mkdir -p, remembering every remote dir this run already checked: the old
    # per-file segment loop cost ~4 round trips per file and dominated the run.
    ensured = {root}
    stats = {"made": 0, "uploaded": 0, "skipped": 0}

    def ensure_dir(path):
        if path in ensured or not path:
            return
        parent = path.rsplit("/", 1)[0]
        if parent:
            ensure_dir(parent)
        if not sftp_exists(sftp, path):
            try:
                sftp.mkdir(path)
                stats["made"] += 1
            except OSError:
                pass
        ensured.add(path)

    for rel, full in local_files:
        remote = root + "/" + rel
        ensure_dir(remote.rsplit("/", 1)[0])
        size = os.path.getsize(full)
        # Vite names bundles by content hash, so an equal-size file is unchanged.
        # index.html is always rewritten - it is 3 KB and is the entry point.
        if not FORCE_UPLOAD and rel != "index.html" and sftp_size(sftp, remote) == size:
            stats["skipped"] += 1
            print("SKIP", rel, size)
            continue
        with open(full, "rb") as fh:
            data = fh.read()
        with sftp.open(remote, "wb") as f:
            f.write(data)
        stats["uploaded"] += 1
        print("PUT", rel, len(data))
        sys.stdout.flush()
    print("uploaded", stats["uploaded"], "files; skipped", stats["skipped"],
          "unchanged; dirs created:", stats["made"])

    for probe in ["index.html", ".htaccess"]:
        p = root + "/" + probe
        print("VERIFY", probe, "->", "OK" if sftp_exists(sftp, p) else "MISSING")

    sftp.close()
    cli.close()
    print("DONE")


if __name__ == "__main__":
    main()

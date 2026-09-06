"""Remove stray directory tree(s) accidentally created by the botched deploy.

The first deploy ran with a Git-Bash-converted Windows path as the SFTP target,
so the server now has a 'C:' directory under the SFTP home containing the whole
upload. This finds and recursively deletes such trees.
"""
import os
import stat
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ssh_tool"))

import paramiko  # noqa: E402

HOST = "217.21.72.255"
PORT = 65002
USER = "u403046506"

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, port=PORT, username=USER, password=os.environ["SSH_PASS"], timeout=25)
sftp = cli.open_sftp()
home = sftp.normalize(".")
print("home:", home)
print("top-level:", sftp.listdir(home))

suspicious = [n for n in sftp.listdir(home) if n in ("C:",) or n.lower().startswith("c:")]
for name in suspicious:
    top = home + "/" + name
    print("REMOVING", top)


def rm_rf(path):
    """Recursively delete path (files then subdirs), collecting stats."""
    files = dirs = 0

    def walk(p):
        nonlocal files, dirs
        try:
            entries = sftp.listdir_attr(p)
        except FileNotFoundError:
            return
        for e in entries:
            child = p + "/" + e.filename
            if stat.S_ISDIR(e.st_mode):
                walk(child)
                try:
                    sftp.rmdir(child)
                    dirs += 1
                except OSError:
                    pass
            else:
                try:
                    sftp.remove(child)
                    files += 1
                except OSError:
                    pass

    walk(path)
    try:
        sftp.rmdir(path)
        dirs += 1
    except OSError:
        pass
    return files, dirs


for name in suspicious:
    top = home + "/" + name
    f, d = rm_rf(top)
    print("removed", name, "- files:", f, "dirs:", d)

print("top-level after:", sftp.listdir(home))
sftp.close()
cli.close()
print("DONE")

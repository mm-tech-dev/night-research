#!/usr/bin/env python3
"""
Run SSH commands on remote server.
Reads password from FL_SSH_PASS env var.
Usage: python ssh-run.py "command here"
"""
import os, sys, paramiko, socket

HOST = '103.95.119.117'
PORT = 22
USER = 'free_lan1'
PASS = os.environ.get('FL_SSH_PASS', '')

if not PASS:
    print('ERR: set FL_SSH_PASS env var', file=sys.stderr)
    sys.exit(1)

cmd = sys.argv[1] if len(sys.argv) > 1 else 'whoami'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20, look_for_keys=False, allow_agent=False)
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    if out:
        try: sys.stdout.write(out)
        except UnicodeEncodeError: sys.stdout.buffer.write(out.encode('utf-8'))
    if err:
        try: sys.stderr.write(err)
        except UnicodeEncodeError: sys.stderr.buffer.write(err.encode('utf-8'))
    sys.exit(stdout.channel.recv_exit_status())
except paramiko.AuthenticationException:
    print('ERR: authentication failed', file=sys.stderr); sys.exit(2)
except (socket.timeout, paramiko.SSHException) as e:
    print(f'ERR: connect: {e}', file=sys.stderr); sys.exit(3)
finally:
    c.close()

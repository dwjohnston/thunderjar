# 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
# Supervising engineer: David Johnston. Humans: add your notes here.
#
# The Fly machine's image: a Docker daemon, and a watchdog that stops the machine when it's idle.
# `up` builds and pushes it when any file in this folder changes.
#
# No SSH server: Fly's own, hallpass, takes the certificates `fly ssh issue` gives, and runs the
# `docker system dial-stdio` that `docker -H ssh://…` asks for. `nc`, which the client's SSH
# connection goes through, is busybox's.
FROM docker:29-dind

# Containers on the bridge network can't use the machine's only DNS server, fdaa::3: it's IPv6, and
# the bridge has none. They're given public ones instead. Builds use the host network (the client
# adds --network host), so their steps resolve names through fdaa::3.
COPY daemon.json /etc/docker/daemon.json
COPY entrypoint.sh /usr/local/bin/thunderjar-entrypoint.sh
RUN chmod +x /usr/local/bin/thunderjar-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/thunderjar-entrypoint.sh"]

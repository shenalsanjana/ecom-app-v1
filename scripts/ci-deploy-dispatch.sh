#!/usr/bin/env bash
set -euo pipefail

# scripts/ci-deploy-dispatch.sh — forced-command dispatcher for the CI deploy
# SSH key.
#
# DEPLOY_OVH.md's required CI-key hardening step restricts the deploy key in
# authorized_keys with `command="/home/ubuntu/devops/ecom-app-v1/scripts/ci-deploy-dispatch.sh"`.
# A forced command like that overrides ANY command the client sends — sshd
# runs this script instead, no matter what `ssh ... '<cmd>'` asked for. sshd
# still exposes what the client asked for via $SSH_ORIGINAL_COMMAND, which is
# what this script inspects.
#
# .github/workflows/deploy.yml needs the CI key for two different
# operations: running the deploy, and (after deploy) reading back the VPS's
# current commit to confirm it matches the commit that was approved. A plain
# forced command can only ever run ONE fixed command, which would silently
# break one of those two uses. This script is the resolution: it allow-lists
# exactly the two command strings the workflow sends and rejects anything
# else, so a leaked key still cannot open a shell or run arbitrary commands.
#
# Do not add cases here beyond these two without also updating
# .github/workflows/deploy.yml to match — the strings must be identical.
#
# NOT CURRENTLY IN USE. The CI key on this VPS is installed unrestricted, by
# the repository owner's decision, so sshd runs the client's command directly
# and never invokes this script. It is kept, and its allow-list kept in sync
# with the workflow, so that adding the `restrict,command="..."` prefix to the
# key's authorized_keys line is the only step needed to turn the restriction
# on. Until that prefix is added, a leaked CI key grants a full shell on the
# `ubuntu` account, which is in both the `sudo` and `docker` groups.

cd "$(dirname "$0")/.."

case "${SSH_ORIGINAL_COMMAND:-}" in
  "cd /home/ubuntu/devops/ecom-app-v1 && ./scripts/deploy.sh")
    exec ./scripts/deploy.sh
    ;;
  "cd /home/ubuntu/devops/ecom-app-v1 && git rev-parse HEAD")
    exec git rev-parse HEAD
    ;;
  *)
    echo "ci-deploy-dispatch: rejected command: ${SSH_ORIGINAL_COMMAND:-<empty>}" >&2
    exit 1
    ;;
esac

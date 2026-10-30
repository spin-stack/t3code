#!/bin/sh
# Rebuilds the spin branch: an upstream release tag with each patch branch merged on it, in the
# order below. Run it from a clone of the fork with every patch/* branch at hand, read from git
# rather than the tree it switches away from:
#
#   git show patch/workflows:.github/spin/stack.sh | sh -s v0.1.5
#
# A patch that conflicts with another stops the stack: resolve it, commit, and run again - with
# rerere on, git replays the resolution next time.
set -eu
base=${1:?usage: stack.sh <upstream tag>}
patches="workflows trim-nav no-welcome no-open-in only-claude-codex provider-login"

git config rerere.enabled true
git switch -C spin "$base"
for p in $patches; do
	git merge --no-ff --no-edit -m "spin: stack patch/$p" "patch/$p"
done

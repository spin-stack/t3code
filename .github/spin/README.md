# Spinbox's fork of T3 Code

Spinbox deploys T3 Code's server as upstream releases it and the web client built here. What is
Spinbox's is a stack of small branches on an upstream release tag:

- `patch/<topic>`: one change each, branched from the upstream tag. A change that suits everyone
  also goes upstream as a pull request; once upstream takes it, the branch is deleted.
- `spin`: the tag with every patch branch merged in order (`.github/spin/stack.sh`). It is the
  only branch built and deployed, and the fork's default branch.

## Releasing

1. `git show patch/workflows:.github/spin/stack.sh | sh -s <upstream tag>` and push `spin` with `--force-with-lease`.
2. Tag `spin` as `v<upstream version>-spin.<n>` and push the tag. The `spin-client` workflow
   builds the client and publishes it as a release of this fork.
3. In spin-stack/spin, pin the release's tarball (`versions.yaml`, `t3code-client`) beside the
   upstream server it was built for (`t3code`).

## Following upstream

Rebase each `patch/*` branch onto the new upstream tag, then release as above. A branch that no
longer rebases names the change that broke. One that rebases can still have stopped working: a
page or action upstream renamed shows again under its new name. The push of `spin` runs the
patches' tests (`apps/web/src/spin/*.test.ts`), which fail on what upstream no longer names.

---
name: release-checklist
description: Prepares a software release with version bump, changelog, tests, tag and release notes, and stops at each step that needs a human decision.
tags: [development, release, git]
license: MIT
---

# Release checklist

Use this skill when the user wants to publish a new version of a project.

## Steps

1. Read the current version and the changes since the last tag (`git log <last-tag>..HEAD --oneline`).
2. Propose the next version number (major, minor or patch) and explain why. Wait for confirmation.
3. Update the version in the project files and add a `CHANGELOG.md` section.
4. Run the test suite and the project checks. Stop if something fails.
5. Show the diff and the commit message. Wait for confirmation before committing.
6. Create the tag only after the commit is confirmed.
7. Draft release notes from the changelog section.

The skill never pushes, publishes or deletes anything without an explicit confirmation from the user.

The helper `scripts/changes.sh` prints the commits since the last tag. Read it before running it.

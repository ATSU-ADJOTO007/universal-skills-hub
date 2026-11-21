#!/bin/sh
# Prints the commits since the most recent tag (read only).
last=$(git describe --tags --abbrev=0 2>/dev/null)
if [ -z "$last" ]; then
  git log --oneline
else
  git log "$last"..HEAD --oneline
fi

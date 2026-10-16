#!/bin/sh
game_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
exec "$game_dir/secret-of-goku" --fullscreen "$@"

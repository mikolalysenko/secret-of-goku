#!/bin/sh
# Keep paths with spaces intact, including games installed on a Deck SD card.
game_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
exec "$game_dir/secret-of-goku" "$@"

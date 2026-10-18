# Headless libretro host for the SNES cartridge tests (see retro-host.c).
#   make -C snes/tools/retro-host            -> .local/tools/emu/retro-host
#   make -C snes/tools/retro-host cores      -> clone and build the snes9x and
#                                               bsnes libretro cores (build-cores.sh)
# Nothing built here is committed: binaries, core sources and cores all live
# under .local/ (ignored by Git).
REPO   := $(abspath ../../..)
OUT    ?= $(REPO)/.local/tools/emu/retro-host
CC     ?= cc
CFLAGS ?= -O2 -g -Wall -Wextra -Wno-unused-parameter -std=c11
LIBS   := -lz
ifeq ($(shell uname -s),Linux)
LIBS   += -ldl
endif

$(OUT): retro-host.c libretro.h Makefile
	@mkdir -p $(dir $(OUT))
	$(CC) $(CFLAGS) -o $@ retro-host.c $(LIBS)

cores:
	./build-cores.sh

clean:
	rm -f $(OUT)

.PHONY: cores clean

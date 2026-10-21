#!/usr/bin/env python3
"""Headless Mesen core host with a raw DAC recording tap. Built by capture-build.mjs.
The normal regression suites use the maintainer's unmodified MESEN binary.
"""
import ctypes
import json
import os
from pathlib import Path
import sys
import time

root = Path(__file__).resolve().parents[3] / '.local/snes-test/audio'
# Honor the same opt-in as the normal Mesen harness; do not bypass it.
settings = json.loads((Path.home() / 'Library/Application Support/Mesen2/settings.json').read_text(encoding='utf-8-sig'))
def enabled(value):
    if isinstance(value, dict):
        return value.get('AllowIoOsAccess') is True or any(enabled(v) for v in value.values())
    if isinstance(value, list):
        return any(enabled(v) for v in value)
    return False
if not enabled(settings):
    sys.exit('Mesen AllowIoOsAccess is not true; enable it before running captures.')
lib = ctypes.CDLL(str(root / 'mesen-source/InteropDLL/obj.osx-arm64/MesenCore.dylib'))
lib.InitDll()
lib.InitializeEmu.argtypes = [ctypes.c_char_p, ctypes.c_void_p, ctypes.c_void_p] + [ctypes.c_bool] * 4
home = root / 'capture-home'
home.mkdir(exist_ok=True)
lib.InitializeEmu(os.fsencode(home), None, None, True, True, True, True)
lib.Pause()
lib.AudioCaptureConfig()
lib.LoadRom.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
lib.LoadRom.restype = ctypes.c_bool
args = [x for x in sys.argv[1:] if not x.startswith('--')]
rom, script = map(Path, args[-2:])
script = script.resolve()
if not lib.LoadRom(os.fsencode(rom.resolve()), b''):
    raise RuntimeError('ROM load failed')
lib.InitializeDebugger()
lib.LoadScript.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
lib.LoadScript.restype = ctypes.c_int
idx = lib.LoadScript(os.fsencode(script.name), os.fsencode(script.parent), script.read_bytes(), -1)
lib.IsRunning.restype = ctypes.c_bool
lib.AudioCaptureConfig()
lib.Resume()
limit = time.monotonic() + 600
while lib.IsRunning() and time.monotonic() < limit:
    time.sleep(.02)
code = lib.GetStopCode() if not lib.IsRunning() else 124
buf = ctypes.create_string_buffer(65536)
lib.GetScriptLog(idx, buf, 65536)
print(buf.value.decode(errors='replace'))
lib.Stop()
lib.Release()
sys.exit(code)

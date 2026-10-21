// Build a pinned Mesen core with a read-only stereo DAC tap. This does not
// change the emulation, resample, normalize, or inject any audio assets.
// macOS arm64: clang, make, SDL2 (sdl2-config). No .NET UI build is required.
import {mkdirSync,existsSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const repo=resolve(import.meta.dirname,'../../..'),out=join(repo,'.local/snes-test/audio'),source=join(out,'mesen-source');
export const MESEN_CAPTURE_REV='b9fa69ddc6d0a331fb103fdb5eef6904305703c2';
function run(cmd,args,cwd=repo){const r=spawnSync(cmd,args,{cwd,encoding:'utf8'});if(r.status!==0)throw Error(`${cmd}: ${r.stderr}\n${r.stdout}`);return r.stdout;}
mkdirSync(out,{recursive:true});
if(!existsSync(source))run('git',['clone','https://github.com/SourMesen/Mesen2.git',source]);
const rev=run('git',['rev-parse','HEAD'],source).trim();
if(rev!==MESEN_CAPTURE_REV)run('git',['checkout','--detach',MESEN_CAPTURE_REV],source);
const original=p=>run('git',['show',`${MESEN_CAPTURE_REV}:${p}`],source);
function patch(file,edits){let s=original(file);for(const [a,b] of edits){if(s.split(a).length!==2)throw Error(`capture patch ambiguous: ${file}`);s=s.replace(a,b);}writeFileSync(join(source,file),s);}
patch('Core/SNES/DSP/Dsp.cpp',[
 ['#include "pch.h"','#include "pch.h"\nextern "C" FILE* audioCapture;'],
 ['\t\t\t_state.OutSamples[0] = 0;','\t\t\tif(audioCapture) fwrite(_dspOutput + _outSampleCount, sizeof(int16_t), 2, audioCapture);\n\t\t\t_state.OutSamples[0] = 0;'],
]);
patch('Core/Debugger/LuaApi.cpp',[
 ['#include "pch.h"','#include "pch.h"\nextern "C" FILE* audioCapture;'],
 ['{ "getMemorySize", LuaApi::GetMemorySize },',`{ "getMemorySize", LuaApi::GetMemorySize },
 { "recordAudio", [](lua_State* l) -> int {
   if(audioCapture) fclose(audioCapture);
   audioCapture = fopen(luaL_checkstring(l,1),"wb");
   if(!audioCapture) return luaL_error(l,"Cannot open audio capture");
   return 0;
 } },
 { "stopAudio", [](lua_State*) -> int {
   if(audioCapture) fclose(audioCapture);
   audioCapture = nullptr;return 0;
 } },`],
]);
writeFileSync(join(source,'InteropDLL/AudioCapture.cpp'),`#include "Common.h"
#include "Shared/Emulator.h"
#include "Shared/EmuSettings.h"
extern unique_ptr<Emulator> _emu;
extern "C" {
FILE* audioCapture = nullptr;
DllExport void AudioCaptureConfig() {
 _emu->GetSettings()->GetDebugConfig().ScriptAllowIoOsAccess = true;
 _emu->GetSettings()->GetSnesConfig().RamPowerOnState = RamState::AllZeros;
 _emu->GetSettings()->GetSnesConfig().Port1.Type = ControllerType::SnesController;
 _emu->GetSettings()->SetFlag(EmulationFlags::ConsoleMode);
 _emu->GetSettings()->SetFlag(EmulationFlags::MaximumSpeed);
}
}
`);
const r=spawnSync('make',['core','-j8'],{cwd:source,encoding:'utf8',maxBuffer:32e6});
writeFileSync(join(out,'capture-build.log'),(r.stdout??'')+(r.stderr??''));
if(r.status!==0)throw Error('Mesen capture build failed; see .local/snes-test/audio/capture-build.log');
chmodSync(join(import.meta.dirname,'capture-host.py'),0o755);
console.log(`Mesen ${MESEN_CAPTURE_REV}: raw DSP capture ready`);

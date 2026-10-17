// Addresses of the destroy module's test ABI, read from the module source
// (snes/src/modules/destroy/module.asm and core/ram.asm) so tests never
// drift from the assembly.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');

export function destroyAbi(){
  const sources=['snes/src/core/ram.asm','snes/src/core/shared.asm','snes/src/core/core.asm','snes/src/modules/destroy/module.asm'].map(p=>readFileSync(resolve(repo,p),'utf8')).join('\n');
  const defs=new Map();
  for(const line of sources.split('\n')){
    const m=line.match(/^\s*!(\w+)\s*(#?=)\s*([^;]+)/);
    if(m)defs.set(m[1],m[3].trim());
  }
  const value=name=>{
    let expr=defs.get(name);
    if(expr===undefined)throw Error('undefined define '+name);
    expr=expr.replace(/!(\w+)/g,(_,n)=>String(value(n))).replace(/\$([0-9A-Fa-f]+)/g,'0x$1');
    // asar defaults to left-to-right evaluation; the module uses #= with
    // parentheses, which JavaScript evaluates the same way.
    return Function(`return (${expr})`)();
  };
  const names=['RAM_DESTROY','arg_x','arg_y','arg_dir','arg_len','arg_half','arg_taper','arg_kind','arg_str','arg_id','arg_layer',
    'd_qn','d_qlive','d_cn','d_flags','out_react','out_rmap','out_rows','out_demo','out_sfx',
    'dbg_cmd','dbg_arg','dbg_res','dbg_n','dbg_ev','dbg_evn','dbg_script','bp_state','bp_event','orb_base','P_DOORS','P_TREE','DQ','DC','FX_SEQ','FX_KIND','FX_X','FX_Y',
    'SS','ss_flags','ss_breaks','ss_door','ss_wage','ss_cut','ss_cage','ss_cbits','ss_flash','ss_bmap','ss_bx','ss_by','ss_gear','ss_gbits','ss_end',
    'SSW','ssw_dbgactor','ssw_dismiss','ssw_songs','ssw_lastsong','ssw_remark','ssw_rseq','ssw_loads','ssw_dbgdoor','ssw_dbgrec','ssw_list',
    'SSF_WRECK','SSF_WPLAN','SSF_CRASH','SSF_BOSS','SSF_DECKDONE','SSF_ARMED','SSF_ESCAPED','persist_goku_active'];
  const abi={};
  for(const n of names){
    let v=value(n);
    // WRAM variables are bank-$7E offsets.
    if(n.startsWith('arg_')||n.startsWith('d_')||n.startsWith('out_'))v|=0x7e0000;
    abi[n]=v;
  }
  return abi;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const abi=destroyAbi();
  for(const[k,v]of Object.entries(abi))console.log(k.padEnd(12),'$'+v.toString(16).toUpperCase());
}

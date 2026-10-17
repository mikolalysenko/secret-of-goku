// SPC700 assembler and disassembler (Sony syntax) for the audio module.
//
// Syntax: `MOV A,!$FA00+X` (! = absolute), `MOV A,$12` (direct page),
// `MOV $12,#$34`, `MOV [$2C]+Y,A`, `MOV A,[$2C+X]`, `JMP [!tab+X]`,
// `SET1 $B1.5`, `BBS $B1.7,label`, `MOV1 C,$00B1.3`, `OR1 C,/$0123.4`,
// `CBNE $3C+X,label`, `DBNZ Y,label`, `TCALL 3`, `PCALL $10`.
// Directives: `org <addr>`, `db a,b,…`, `dw a,b,…`, `ds <n>`, `name = expr`.
// Expressions: numbers ($hex, %bin, decimal), labels, + - * / and <lo >hi.
// Labels end with ':'; ';' starts a comment.
//
// CLI: node snes/gen/audio-spc700.mjs <file.bin> <hex start> [count]

const ALU=['OR','AND','EOR','CMP','ADC','SBC'];
// [opcode, mnemonic, template]. Templates use d (direct page), a (absolute,
// written !a), i (#imm), r (relative), m.b (13-bit address + bit), u (PCALL).
const TABLE=[];
const add=(op,mn,tpl='')=>TABLE.push([op,mn,tpl]);
ALU.forEach((mn,k)=>{
 const b=k*0x20;
 add(b+0x04,mn,'A,d');add(b+0x05,mn,'A,!a');add(b+0x06,mn,'A,(X)');add(b+0x07,mn,'A,[d+X]');add(b+0x08,mn,'A,#i');add(b+0x09,mn,'d,d');
 add(b+0x14,mn,'A,d+X');add(b+0x15,mn,'A,!a+X');add(b+0x16,mn,'A,!a+Y');add(b+0x17,mn,'A,[d]+Y');add(b+0x18,mn,'d,#i');add(b+0x19,mn,'(X),(Y)');
});
for(let n=0;n<16;n++)add(n*16+1,'TCALL',String(n));
for(let b=0;b<8;b++){add(b*32+2,'SET1',`d.${b}`);add(b*32+0x12,'CLR1',`d.${b}`);add(b*32+3,'BBS',`d.${b},r`);add(b*32+0x13,'BBC',`d.${b},r`);}
[
 [0x00,'NOP'],[0x0A,'OR1','C,m.b'],[0x0B,'ASL','d'],[0x0C,'ASL','!a'],[0x0D,'PUSH','PSW'],[0x0E,'TSET1','!a'],[0x0F,'BRK'],
 [0x10,'BPL','r'],[0x1A,'DECW','d'],[0x1B,'ASL','d+X'],[0x1C,'ASL','A'],[0x1D,'DEC','X'],[0x1E,'CMP','X,!a'],[0x1F,'JMP','[!a+X]'],
 [0x20,'CLRP'],[0x2A,'OR1','C,/m.b'],[0x2B,'ROL','d'],[0x2C,'ROL','!a'],[0x2D,'PUSH','A'],[0x2E,'CBNE','d,r'],[0x2F,'BRA','r'],
 [0x30,'BMI','r'],[0x3A,'INCW','d'],[0x3B,'ROL','d+X'],[0x3C,'ROL','A'],[0x3D,'INC','X'],[0x3E,'CMP','X,d'],[0x3F,'CALL','!a'],
 [0x40,'SETP'],[0x4A,'AND1','C,m.b'],[0x4B,'LSR','d'],[0x4C,'LSR','!a'],[0x4D,'PUSH','X'],[0x4E,'TCLR1','!a'],[0x4F,'PCALL','u'],
 [0x50,'BVC','r'],[0x5A,'CMPW','YA,d'],[0x5B,'LSR','d+X'],[0x5C,'LSR','A'],[0x5D,'MOV','X,A'],[0x5E,'CMP','Y,!a'],[0x5F,'JMP','!a'],
 [0x60,'CLRC'],[0x6A,'AND1','C,/m.b'],[0x6B,'ROR','d'],[0x6C,'ROR','!a'],[0x6D,'PUSH','Y'],[0x6E,'DBNZ','d,r'],[0x6F,'RET'],
 [0x70,'BVS','r'],[0x7A,'ADDW','YA,d'],[0x7B,'ROR','d+X'],[0x7C,'ROR','A'],[0x7D,'MOV','A,X'],[0x7E,'CMP','Y,d'],[0x7F,'RETI'],
 [0x80,'SETC'],[0x8A,'EOR1','C,m.b'],[0x8B,'DEC','d'],[0x8C,'DEC','!a'],[0x8D,'MOV','Y,#i'],[0x8E,'POP','PSW'],[0x8F,'MOV','d,#i'],
 [0x90,'BCC','r'],[0x9A,'SUBW','YA,d'],[0x9B,'DEC','d+X'],[0x9C,'DEC','A'],[0x9D,'MOV','X,SP'],[0x9E,'DIV','YA,X'],[0x9F,'XCN','A'],
 [0xA0,'EI'],[0xAA,'MOV1','C,m.b'],[0xAB,'INC','d'],[0xAC,'INC','!a'],[0xAD,'CMP','Y,#i'],[0xAE,'POP','A'],[0xAF,'MOV','(X)+,A'],
 [0xB0,'BCS','r'],[0xBA,'MOVW','YA,d'],[0xBB,'INC','d+X'],[0xBC,'INC','A'],[0xBD,'MOV','SP,X'],[0xBE,'DAS','A'],[0xBF,'MOV','A,(X)+'],
 [0xC0,'DI'],[0xC4,'MOV','d,A'],[0xC5,'MOV','!a,A'],[0xC6,'MOV','(X),A'],[0xC7,'MOV','[d+X],A'],[0xC8,'CMP','X,#i'],[0xC9,'MOV','!a,X'],
 [0xCA,'MOV1','m.b,C'],[0xCB,'MOV','d,Y'],[0xCC,'MOV','!a,Y'],[0xCD,'MOV','X,#i'],[0xCE,'POP','X'],[0xCF,'MUL','YA'],
 [0xD0,'BNE','r'],[0xD4,'MOV','d+X,A'],[0xD5,'MOV','!a+X,A'],[0xD6,'MOV','!a+Y,A'],[0xD7,'MOV','[d]+Y,A'],[0xD8,'MOV','d,X'],
 [0xD9,'MOV','d+Y,X'],[0xDA,'MOVW','d,YA'],[0xDB,'MOV','d+X,Y'],[0xDC,'DEC','Y'],[0xDD,'MOV','A,Y'],[0xDE,'CBNE','d+X,r'],[0xDF,'DAA','A'],
 [0xE0,'CLRV'],[0xE4,'MOV','A,d'],[0xE5,'MOV','A,!a'],[0xE6,'MOV','A,(X)'],[0xE7,'MOV','A,[d+X]'],[0xE8,'MOV','A,#i'],[0xE9,'MOV','X,!a'],
 [0xEA,'NOT1','m.b'],[0xEB,'MOV','Y,d'],[0xEC,'MOV','Y,!a'],[0xED,'NOTC'],[0xEE,'POP','Y'],[0xEF,'SLEEP'],
 [0xF0,'BEQ','r'],[0xF4,'MOV','A,d+X'],[0xF5,'MOV','A,!a+X'],[0xF6,'MOV','A,!a+Y'],[0xF7,'MOV','A,[d]+Y'],[0xF8,'MOV','X,d'],
 [0xF9,'MOV','X,d+Y'],[0xFA,'MOV','d,d'],[0xFB,'MOV','Y,d+X'],[0xFC,'INC','Y'],[0xFD,'MOV','Y,A'],[0xFE,'DBNZ','Y,r'],[0xFF,'STOP'],
].forEach(([op,mn,tpl])=>add(op,mn,tpl));
if(TABLE.length!==256||new Set(TABLE.map(t=>t[0])).size!==256)throw Error('SPC700 table incomplete');
const BY_OP=[];for(const t of TABLE)BY_OP[t[0]]=t;

// Operand byte layout for each template: returns array of field kinds in byte order.
function layout(tpl){
 if(tpl==='d,d')return['src','dst'];        // MOV dd,ds stores ds first
 if(tpl==='d,#i')return['i','d'];           // MOV d,#i stores #i first
 const f=[];
 for(const m of tpl.matchAll(/m\.b|!a|#i|\bd\b|\br\b|\bu\b/g)){
  const k=m[0];f.push(k==='m.b'?'m':k==='!a'?'a':k==='#i'?'i':k);
 }
 return f;
}
const size=k=>k==='a'||k==='m'?2:1;
export function opLength(op){const [, ,tpl]=BY_OP[op];return 1+layout(tpl).reduce((s,k)=>s+size(k),0);}

const h2=v=>v.toString(16).toUpperCase().padStart(2,'0'),h4=v=>v.toString(16).toUpperCase().padStart(4,'0');
export const spcHex={h2,h4};

// ---------------------------------------------------------------- disassembler
export function decode(read,pc){
 const op=read(pc),[ ,mn,tpl]=BY_OP[op];
 const kinds=layout(tpl);let p=pc+1;const vals=[];
 for(const k of kinds){if(size(k)===2){vals.push(read(p&0xffff)|read((p+1)&0xffff)<<8);p+=2;}else{vals.push(read(p&0xffff));p+=1;}}
 const len=p-pc;let target=null;
 const val=k=>vals[kinds.indexOf(k)];
 let text=tpl;
 if(tpl==='d,d')text=`$${h2(vals[1])},$${h2(vals[0])}`;
 else if(tpl==='d,#i')text=`$${h2(vals[1])},#$${h2(vals[0])}`;
 else{
  text=text.replace('m.b',()=>{const v=val('m');return `$${h4(v&0x1fff)}.${v>>13}`;});
  text=text.replace('!a',()=>{const v=val('a');if(op===0x3F||op===0x5F)target=v;return '!$'+h4(v);});
  text=text.replace('#i',()=>'#$'+h2(val('i')));
  text=text.replace(/\bd\b/,()=>'$'+h2(val('d')));
  text=text.replace(/\br\b/,()=>{const r=val('r');target=(pc+len+((r<<24)>>24))&0xffff;return '$'+h4(target);});
  text=text.replace(/\bu\b/,()=>'$'+h2(val('u')));
 }
 return {op,len,name:mn,text:(mn+(text?' '+text:'')),target,bytes:Array.from({length:len},(_,i)=>read((pc+i)&0xffff))};
}
export function disasm(read,start,count,labels={}){
 const out=[];let pc=start;
 for(let i=0;i<count;i++){
  const d=decode(read,pc);
  const lab=labels[pc]?labels[pc]+':':'';
  out.push(`${lab.padEnd(14)}${h4(pc)}  ${d.bytes.map(h2).join(' ').padEnd(9)} ${d.text}`);
  pc=(pc+d.len)&0xffff;
 }
 return out.join('\n');
}

// ---------------------------------------------------------------- assembler
const REG=new Set(['A','X','Y','YA','SP','PSW','C','(X)','(Y)','(X)+']);
function classify(mn,part,index,parts){
 const s=part.trim(),u=s.toUpperCase();
 if(REG.has(u))return{t:u};
 if(s.startsWith('#'))return{t:'#i',e:s.slice(1)};
 let m;
 if((m=s.match(/^\[\s*!(.+)\+\s*X\s*\]$/i)))return{t:'[!a+X]',e:m[1]};
 if((m=s.match(/^\[(.+)\+\s*X\s*\]$/i)))return{t:'[d+X]',e:m[1]};
 if((m=s.match(/^\[(.+)\]\s*\+\s*Y$/i)))return{t:'[d]+Y',e:m[1]};
 if((m=s.match(/^!(.+)\+\s*X$/i)))return{t:'!a+X',e:m[1]};
 if((m=s.match(/^!(.+)\+\s*Y$/i)))return{t:'!a+Y',e:m[1]};
 if(s.startsWith('!'))return{t:'!a',e:s.slice(1)};
 if((m=s.match(/^\/(.+)\.([0-7])$/)))return{t:'/m.b',e:m[1],bit:Number(m[2])};
 if((m=s.match(/^(.+)\.([0-7])$/))){
  if(['SET1','CLR1','BBS','BBC'].includes(mn))return{t:'d.b',e:m[1],bit:Number(m[2])};
  return{t:'m.b',e:m[1],bit:Number(m[2])};
 }
 if((m=s.match(/^(.+)\+\s*X$/i)))return{t:'d+X',e:m[1]};
 if((m=s.match(/^(.+)\+\s*Y$/i)))return{t:'d+Y',e:m[1]};
 const branch=/^(B(PL|MI|VC|VS|CC|CS|NE|EQ|RA))$/.test(mn)||((mn==='BBS'||mn==='BBC'||mn==='CBNE'||mn==='DBNZ')&&index===parts-1);
 if(branch)return{t:'r',e:s};
 if(mn==='PCALL')return{t:'u',e:s};
 if(mn==='CALL'||mn==='JMP')return{t:'!a',e:s};   // only absolute forms exist
 if(mn==='TCALL')return{t:'n',e:s};
 return{t:'d',e:s};
}
function splitOperands(s){
 const out=[];let depth=0,cur='';
 for(const c of s){if(c==='['||c==='(')depth++;if(c===']'||c===')')depth--;if(c===','&&depth===0){out.push(cur);cur='';}else cur+=c;}
 if(cur.trim())out.push(cur);return out;
}
function evalExpr(expr,syms,pc,{pass,line}){
 let s=expr.trim();
 let part=null;
 if(s.startsWith('<')){part='lo';s=s.slice(1);}else if(s.startsWith('>')){part='hi';s=s.slice(1);}
 const tokens=s.match(/\$[0-9A-Fa-f]+|%[01]+|\d+|[A-Za-z_.][A-Za-z0-9_.]*|\*|[-+*/()]/g);
 if(!tokens||tokens.join('')!==s.replace(/\s+/g,''))throw Error(`line ${line}: bad expression "${expr}"`);
 let i=0;
 const prim=()=>{
  const t=tokens[i++];
  if(t==='(') {const v=sum();if(tokens[i++]!==')')throw Error(`line ${line}: missing )`);return v;}
  if(t==='-')return -prim();
  if(t==='*')return pc;
  if(t.startsWith('$'))return parseInt(t.slice(1),16);
  if(t.startsWith('%'))return parseInt(t.slice(1),2);
  if(/^\d/.test(t))return parseInt(t,10);
  if(syms.has(t))return syms.get(t);
  if(pass===1)return 0;
  throw Error(`line ${line}: undefined symbol ${t}`);
 };
 const prod=()=>{let v=prim();while(tokens[i]==='*'||tokens[i]==='/'){const o=tokens[i++],w=prim();v=o==='*'?v*w:Math.trunc(v/w);}return v;};
 const sum=()=>{let v=prod();while(tokens[i]==='+'||tokens[i]==='-'){const o=tokens[i++],w=prod();v=o==='+'?v+w:v-w;}return v;};
 let v=sum();if(i!==tokens.length)throw Error(`line ${line}: trailing tokens in "${expr}"`);
 if(part==='lo')v&=0xff;if(part==='hi')v=(v>>8)&0xff;
 return v;
}
// Assemble source text. Returns {segments:[{addr,bytes}], symbols:Map, listing}.
export function assemble(source,{symbols={},name='spc'}={}){
 const lines=source.split('\n');
 let result=null;
 for(const pass of [1,2]){
  const syms=new Map(Object.entries(symbols));
  if(pass===2)for(const [k,v] of result.syms)syms.set(k,v);
  const segments=[];let seg=null,pc=0;const listing=[];
  const emit=bytes=>{if(!seg){seg={addr:pc,bytes:[]};segments.push(seg);}seg.bytes.push(...bytes);pc+=bytes.length;};
  for(let ln=0;ln<lines.length;ln++){
   let text=lines[ln].replace(/;.*$/,'').trim();if(!text)continue;
   const ctx={pass,line:`${name}:${ln+1}`};
   let m;
   while((m=text.match(/^([A-Za-z_.][A-Za-z0-9_.]*):\s*/))){
    const lab=m[1];if(pass===1&&syms.has(lab)&&!(lab in symbols))throw Error(`${ctx.line}: duplicate label ${lab}`);
    syms.set(lab,pc);text=text.slice(m[0].length);
   }
   if(!text)continue;
   if((m=text.match(/^([A-Za-z_.][A-Za-z0-9_.]*)\s*=\s*(.+)$/))){syms.set(m[1],evalExpr(m[2],syms,pc,ctx));continue;}
   const sp=text.search(/\s/);const mnRaw=sp<0?text:text.slice(0,sp),rest=sp<0?'':text.slice(sp+1).trim();
   const mn=mnRaw.toUpperCase();
   if(mn==='ORG'){pc=evalExpr(rest,syms,pc,ctx);seg=null;continue;}
   if(mn==='DB'){const start=pc;emit(splitOperands(rest).map(e=>{const v=evalExpr(e,syms,pc,ctx);if(pass===2&&(v<-128||v>255))throw Error(`${ctx.line}: byte out of range`);return v&0xff;}));listing.push([start,text]);continue;}
   if(mn==='DW'){const start=pc;const out=[];for(const e of splitOperands(rest)){const v=evalExpr(e,syms,pc,ctx);out.push(v&0xff,(v>>8)&0xff);}emit(out);listing.push([start,text]);continue;}
   if(mn==='DS'){const n=evalExpr(rest,syms,pc,ctx);emit(new Array(n).fill(0));continue;}
   const parts=rest?splitOperands(rest):[];
   const ops=parts.map((p,i)=>classify(mn,p,i,parts.length));
   const tpl=ops.map(o=>o.t==='d.b'?'d.b':o.t==='n'?'n':o.t).join(',');
   let op=null,fixedTpl=null;
   if(mn==='TCALL'){const n=evalExpr(ops[0].e,syms,pc,ctx);if(!(n>=0&&n<16))throw Error(`${ctx.line}: bad TCALL`);op=n*16+1;fixedTpl=String(n);}
   else for(const [code,m2,t] of TABLE){
    if(m2!==mn)continue;
    const norm=t.replace(/d\.[0-7]/,'d.b');
    if(norm===tpl){
     if(/d\.[0-7]/.test(t)){const bit=ops.find(o=>o.t==='d.b').bit;if(!t.includes(`d.${bit}`))continue;}
     op=code;fixedTpl=t;break;
    }
   }
   if(op===null)throw Error(`${ctx.line}: no encoding for "${mn} ${tpl}" (${text})`);
   const kinds=layout(fixedTpl);
   // Operand values in template order of appearance.
   const valueOf={};
   const exprOps=ops.filter(o=>o.e!==undefined);
   const start=pc,len=1+kinds.reduce((s,k)=>s+size(k),0);
   const bytes=[op];
   const get=(o)=>evalExpr(o.e,syms,start,ctx);
   if(fixedTpl==='d,d'){const dst=get(exprOps[0]),src=get(exprOps[1]);bytes.push(src&0xff,dst&0xff);if(pass===2&&(dst>255||src>255||dst<0||src<0))throw Error(`${ctx.line}: direct page out of range`);}
   else if(fixedTpl==='d,#i'){const d=get(exprOps[0]),i=get(exprOps[1]);bytes.push(i&0xff,d&0xff);if(pass===2&&(d>255||d<0||i>255||i<-128))throw Error(`${ctx.line}: operand out of range`);}
   else if(mn!=='TCALL'){
    let k=0;
    for(const o of exprOps){
     const kind=kinds[k++];let v=get(o);
     if(kind==='r'){v=v-(start+len);if(pass===2&&(v<-128||v>127))throw Error(`${ctx.line}: branch out of range (${v})`);bytes.push(v&0xff);}
     else if(kind==='a'){if(pass===2&&(v<0||v>0xffff))throw Error(`${ctx.line}: address out of range`);bytes.push(v&0xff,(v>>8)&0xff);}
     else if(kind==='m'){if(pass===2&&(v<0||v>0x1fff))throw Error(`${ctx.line}: bit address out of range`);v|=o.bit<<13;bytes.push(v&0xff,(v>>8)&0xff);}
     else{if(pass===2&&(v<-128||v>255))throw Error(`${ctx.line}: ${kind} operand out of range (${v})`);bytes.push(v&0xff);}
    }
   }
   if(bytes.length!==len)throw Error(`${ctx.line}: encoding length mismatch for ${text}`);
   emit(bytes);listing.push([start,text]);
  }
  result={segments,syms,listing};
 }
 return {segments:result.segments,symbols:result.syms,listing:result.listing};
}
// Flatten segments into a 64 KiB image (for tests).
export function toImage(segments,image=new Uint8Array(0x10000)){for(const s of segments)image.set(s.bytes,s.addr);return image;}

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file,start,count='60']=process.argv.slice(2);
 const data=new Uint8Array(readFileSync(file));
 console.log(disasm(a=>data[a]??0,parseInt(start,16),Number(count)));
}

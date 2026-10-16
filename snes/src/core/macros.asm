; Shared macros. %hijack() is the only sanctioned way to patch original code:
; build.mjs parses its HIJACK lines and rejects overlapping patches.

; Replace <len> bytes (>= 4) at <addr> with JML <target>; pads with NOP.
; The original bytes must be re-executed by the target if needed.
macro hijack(addr, target, len, module)
	assert <len> >= 4, "hijack needs at least 4 bytes"
	pushpc
	org <addr>
	JML <target>
	for i = 4..<len>
		NOP
	endfor
	pullpc
	print "HIJACK ", hex(<addr>, 6), " ", dec(<len>), " <module>"
endmacro

; Replace <len> bytes (>= 4) at <addr> with JSL <target>; pads with NOP.
macro hijack_jsl(addr, target, len, module)
	assert <len> >= 4, "hijack needs at least 4 bytes"
	pushpc
	org <addr>
	JSL <target>
	for i = 4..<len>
		NOP
	endfor
	pullpc
	print "HIJACK ", hex(<addr>, 6), " ", dec(<len>), " <module>"
endmacro

; Record a patch of original bytes that is not a jump (data or opcode
; tweaks) so overlap checks still see it. Use before writing at <addr>.
macro patch(addr, len, module)
	print "HIJACK ", hex(<addr>, 6), " ", dec(<len>), " <module>"
endmacro

; Assert original cartridge bytes before patching over them.
macro orig1(addr, b0)
	assert read1(<addr>) == <b0>, "original byte mismatch"
endmacro
macro orig2(addr, w)
	assert read2(<addr>) == <w>, "original word mismatch"
endmacro
macro orig3(addr, l)
	assert read3(<addr>) == <l>, "original long mismatch"
endmacro
macro orig4(addr, d)
	assert read4(<addr>) == <d>, "original dword mismatch"
endmacro

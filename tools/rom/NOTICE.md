# ROM tooling attribution

The modules in this directory are licensed under GNU LGPL version 2.1. A copy is
included in `COPYING.LESSER`.

Map decoding, bitstream decoding, and ROM structure interpretation are adapted
from **Moppleton / Moppu's SecretOfManaRandomizer**, commit
`1404b7bd8552677399f24632c1e37cba37d491ef`, under the same license:

https://github.com/Moppu/SecretOfManaRandomizer/tree/1404b7bd8552677399f24632c1e37cba37d491ef

Relevant upstream files: `SomMapCompressor.cs`, `VanillaMapUtil.cs`,
`VanillaTilesetUtil.cs`, `VanillaRomOffsets.cs`, `VanillaEventUtil.cs`,
`structure/MapHeader.cs`, `structure/MapObject.cs`, and `structure/Door.cs`.
World map RLE also references `hacks/common/enhancement/Ff6StyleMiniMap.cs`.

This is a JavaScript adaptation with strict bounds checks, explicit unsupported
command errors, header identification, JSON output, and synthetic tests. It is
not the upstream project. The tileset16 header accessor is corrected to byte 2
as specified by its field definition and setter. No original game executable
code or ROM is included in these tools. Extracted game data retains its original
copyright; the tooling license does not change that.

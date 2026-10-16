/* Visually audited sprite descriptors only. No runtime animation controller.
 * Source artwork: Dragon Ball Z: Buu's Fury; sheet rip credits SpYn_.
 * See CREDITS.md. Timings/pivots/sockets are authored adaptations. */
(function (root) {
'use strict';
const data = {
  "version": 1,
  "tileSize": 32,
  "sourceY": 32,
  "ticksPerSecond": 60,
  "facingRows": [
    0,
    2,
    1,
    3
  ],
  "directionRows": {
    "down": 0,
    "right": 2,
    "left": 1,
    "up": 3
  },
  "provenance": {
    "game": "Dragon Ball Z: Buu's Fury",
    "ripper": "SpYn_",
    "method": "Every supplied 32×32 cell visually inspected. Bounds and opaque counts measured from the prepared RGBA sheets. Timing, pivots, sockets and action reuse are authored recommendations, not extracted GBA animation metadata.",
    "sourceCreditFile": "CREDITS.md"
  },
  "conventions": {
    "cellIndex": "column * 4 + physicalRow",
    "rect": "[sourceX, sourceY, width, height]",
    "bounds": "[localX, localY, opaqueWidth, opaqueHeight], null if empty",
    "origin": "Fixed local reference [16,31] for ground art, [16,16] for flight. Do not align each frame by its alpha bounds.",
    "ticks": "60 Hz simulation ticks; restart at action age zero, not global wall time. Hit-stop should pause action age.",
    "rows": "Rows0/1/2/3 are down/left/right/up only in the cardinal groups. Special clips explicitly override rows.",
    "sockets": "Local pixel coordinates, manually placed at the visible cupped/extended hands. Upward beam emission is inferred behind the occluding head; draw beam behind the body.",
    "timing": "Looping walk/run/flight; held charge/dead; finite attacks with explicit recovery. Do not loop full attack or transform strips."
  },
  "forms": {
    "goku": {
      "sheet": "goku",
      "source": "assets/source/goku.png",
      "prepared": "assets/sprites/goku.png",
      "width": 2016,
      "height": 192,
      "columns": 63,
      "cells": [
        {
          "column": 0,
          "row": 0,
          "rect": [
            0,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 434,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 0,
          "row": 1,
          "rect": [
            0,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            32
          ],
          "opaque": 310,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                18
              ]
            ]
          }
        },
        {
          "column": 0,
          "row": 2,
          "rect": [
            0,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            32
          ],
          "opaque": 310,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 0,
          "row": 3,
          "rect": [
            0,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 436,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 0,
          "rect": [
            32,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 434,
          "origin": [
            16,
            31
          ],
          "semantic": "blink",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 1,
          "rect": [
            32,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            32
          ],
          "opaque": 310,
          "origin": [
            16,
            31
          ],
          "semantic": "blink",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                18
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 2,
          "rect": [
            32,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            32
          ],
          "opaque": 310,
          "origin": [
            16,
            31
          ],
          "semantic": "blink",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 3,
          "rect": [
            32,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 2,
          "row": 0,
          "rect": [
            64,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            2,
            25,
            30
          ],
          "opaque": 365,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 2,
          "row": 1,
          "rect": [
            64,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            22,
            31
          ],
          "opaque": 339,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                12
              ]
            ]
          }
        },
        {
          "column": 2,
          "row": 2,
          "rect": [
            64,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            22,
            31
          ],
          "opaque": 339,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                20
              ]
            ]
          }
        },
        {
          "column": 2,
          "row": 3,
          "rect": [
            64,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            32
          ],
          "opaque": 385,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                17
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 0,
          "rect": [
            96,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            30
          ],
          "opaque": 406,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 1,
          "rect": [
            96,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            31
          ],
          "opaque": 305,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                14,
                19
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 2,
          "rect": [
            96,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            31
          ],
          "opaque": 305,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                17
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 3,
          "rect": [
            96,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 422,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 0,
          "rect": [
            128,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            31
          ],
          "opaque": 368,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 1,
          "rect": [
            128,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            24,
            30
          ],
          "opaque": 332,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                20,
                21
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 2,
          "rect": [
            128,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            1,
            24,
            30
          ],
          "opaque": 332,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                11
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 3,
          "rect": [
            128,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            24,
            31
          ],
          "opaque": 372,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 0,
          "rect": [
            160,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            30
          ],
          "opaque": 406,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                15
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 1,
          "rect": [
            160,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            31
          ],
          "opaque": 303,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                16,
                17
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 2,
          "rect": [
            160,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            31
          ],
          "opaque": 303,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                14,
                15
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 3,
          "rect": [
            160,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 422,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 0,
          "rect": [
            192,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            24,
            31
          ],
          "opaque": 359,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 1,
          "rect": [
            192,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            22,
            31
          ],
          "opaque": 346,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                12
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 2,
          "rect": [
            192,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            22,
            31
          ],
          "opaque": 346,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                20
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 3,
          "rect": [
            192,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            31
          ],
          "opaque": 378,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 0,
          "rect": [
            224,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            30
          ],
          "opaque": 388,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 1,
          "rect": [
            224,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            31
          ],
          "opaque": 335,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                22
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 2,
          "rect": [
            224,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            31
          ],
          "opaque": 335,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                9,
                14
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 3,
          "rect": [
            224,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 413,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 0,
          "rect": [
            256,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            24,
            31
          ],
          "opaque": 358,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 1,
          "rect": [
            256,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            25,
            30
          ],
          "opaque": 344,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                10,
                11
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 2,
          "rect": [
            256,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            0,
            25,
            30
          ],
          "opaque": 344,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                20,
                21
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 3,
          "rect": [
            256,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            31
          ],
          "opaque": 368,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 0,
          "rect": [
            288,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            30
          ],
          "opaque": 388,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                15
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 1,
          "rect": [
            288,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            30
          ],
          "opaque": 312,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                16,
                20
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 2,
          "rect": [
            288,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            30
          ],
          "opaque": 312,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                11,
                15
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 3,
          "rect": [
            288,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            30
          ],
          "opaque": 408,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 0,
          "rect": [
            320,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            31
          ],
          "opaque": 379,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 1,
          "rect": [
            320,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            24,
            31
          ],
          "opaque": 353,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                26,
                31
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 2,
          "rect": [
            320,
            96,
            32,
            32
          ],
          "bounds": [
            0,
            1,
            24,
            31
          ],
          "opaque": 353,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                0,
                5
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 3,
          "rect": [
            320,
            128,
            32,
            32
          ],
          "bounds": [
            7,
            1,
            23,
            31
          ],
          "opaque": 387,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                14,
                15
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 0,
          "rect": [
            352,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            26,
            31
          ],
          "opaque": 422,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                23,
                28
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 1,
          "rect": [
            352,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            22,
            29
          ],
          "opaque": 335,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                15,
                20
              ],
              [
                22,
                23
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 2,
          "rect": [
            352,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            22,
            29
          ],
          "opaque": 335,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                8,
                9
              ],
              [
                11,
                16
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 3,
          "rect": [
            352,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            26,
            32
          ],
          "opaque": 453,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                22
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 0,
          "rect": [
            384,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            4,
            26,
            28
          ],
          "opaque": 403,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                11,
                11
              ],
              [
                13,
                19
              ],
              [
                23,
                28
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 1,
          "rect": [
            384,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            3,
            26,
            28
          ],
          "opaque": 377,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                6,
                12
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 2,
          "rect": [
            384,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            3,
            26,
            28
          ],
          "opaque": 377,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                25
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 3,
          "rect": [
            384,
            128,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            26,
            32
          ],
          "opaque": 434,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                22
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 0,
          "rect": [
            416,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            3,
            26,
            29
          ],
          "opaque": 377,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                23,
                28
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 1,
          "rect": [
            416,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            23,
            30
          ],
          "opaque": 352,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                6,
                12
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 2,
          "rect": [
            416,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            1,
            23,
            30
          ],
          "opaque": 352,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                25
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 3,
          "rect": [
            416,
            128,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            25,
            32
          ],
          "opaque": 409,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                22
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 0,
          "rect": [
            448,
            32,
            32,
            32
          ],
          "bounds": [
            1,
            0,
            25,
            31
          ],
          "opaque": 373,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                16,
                21
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 1,
          "rect": [
            448,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            1,
            23,
            31
          ],
          "opaque": 382,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                18
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 2,
          "rect": [
            448,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            23,
            31
          ],
          "opaque": 382,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                19
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 3,
          "rect": [
            448,
            128,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            22,
            31
          ],
          "opaque": 383,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                17
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 0,
          "rect": [
            480,
            32,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            25,
            31
          ],
          "opaque": 425,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                8
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 1,
          "rect": [
            480,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            26,
            32
          ],
          "opaque": 371,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 2,
          "rect": [
            480,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            26,
            32
          ],
          "opaque": 371,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                13
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 3,
          "rect": [
            480,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            32
          ],
          "opaque": 436,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 0,
          "rect": [
            512,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            4,
            24,
            28
          ],
          "opaque": 399,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                8
              ],
              [
                12,
                18
              ],
              [
                20,
                20
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 1,
          "rect": [
            512,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            3,
            28,
            29
          ],
          "opaque": 407,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                22,
                27
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 2,
          "rect": [
            512,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            3,
            28,
            29
          ],
          "opaque": 407,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                4,
                9
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 3,
          "rect": [
            512,
            128,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            25,
            32
          ],
          "opaque": 445,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 0,
          "rect": [
            544,
            32,
            32,
            32
          ],
          "bounds": [
            2,
            3,
            25,
            29
          ],
          "opaque": 375,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                8
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 1,
          "rect": [
            544,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            31
          ],
          "opaque": 372,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                22,
                27
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 2,
          "rect": [
            544,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            31
          ],
          "opaque": 372,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                4,
                9
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 3,
          "rect": [
            544,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            21,
            32
          ],
          "opaque": 367,
          "origin": [
            16,
            31
          ],
          "semantic": "cross",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 18,
          "row": 0,
          "rect": [
            576,
            32,
            32,
            32
          ],
          "bounds": [
            2,
            0,
            24,
            31
          ],
          "opaque": 361,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 18,
          "row": 1,
          "rect": [
            576,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            24,
            31
          ],
          "opaque": 354,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                17
              ]
            ]
          }
        },
        {
          "column": 18,
          "row": 2,
          "rect": [
            576,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            0,
            24,
            31
          ],
          "opaque": 354,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                14,
                19
              ]
            ]
          }
        },
        {
          "column": 18,
          "row": 3,
          "rect": [
            576,
            128,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            27,
            30
          ],
          "opaque": 376,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                15
              ]
            ]
          }
        },
        {
          "column": 19,
          "row": 0,
          "rect": [
            608,
            32,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            24,
            32
          ],
          "opaque": 372,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                23
              ]
            ]
          }
        },
        {
          "column": 19,
          "row": 1,
          "rect": [
            608,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            26,
            31
          ],
          "opaque": 383,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                23
              ]
            ]
          }
        },
        {
          "column": 19,
          "row": 2,
          "rect": [
            608,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            26,
            31
          ],
          "opaque": 383,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                12
              ]
            ]
          }
        },
        {
          "column": 19,
          "row": 3,
          "rect": [
            608,
            128,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            22,
            31
          ],
          "opaque": 354,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ]
            ]
          }
        },
        {
          "column": 20,
          "row": 0,
          "rect": [
            640,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            31
          ],
          "opaque": 365,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                18
              ]
            ]
          }
        },
        {
          "column": 20,
          "row": 1,
          "rect": [
            640,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            2,
            24,
            29
          ],
          "opaque": 362,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                23
              ]
            ]
          }
        },
        {
          "column": 20,
          "row": 2,
          "rect": [
            640,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            24,
            29
          ],
          "opaque": 362,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                12
              ]
            ]
          }
        },
        {
          "column": 20,
          "row": 3,
          "rect": [
            640,
            128,
            32,
            32
          ],
          "bounds": [
            2,
            0,
            25,
            31
          ],
          "opaque": 375,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ]
            ]
          }
        },
        {
          "column": 21,
          "row": 0,
          "rect": [
            672,
            32,
            32,
            32
          ],
          "bounds": [
            2,
            2,
            25,
            29
          ],
          "opaque": 376,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 21,
          "row": 1,
          "rect": [
            672,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            31
          ],
          "opaque": 324,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                21
              ]
            ]
          }
        },
        {
          "column": 21,
          "row": 2,
          "rect": [
            672,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            31
          ],
          "opaque": 324,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                14
              ]
            ]
          }
        },
        {
          "column": 21,
          "row": 3,
          "rect": [
            672,
            128,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 407,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ]
            ]
          }
        },
        {
          "column": 22,
          "row": 0,
          "rect": [
            704,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            2,
            25,
            30
          ],
          "opaque": 378,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          },
          "sockets": {
            "charge": [
              13,
              21
            ]
          }
        },
        {
          "column": 22,
          "row": 1,
          "rect": [
            704,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            3,
            23,
            29
          ],
          "opaque": 342,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                25,
                30
              ]
            ]
          },
          "sockets": {
            "charge": [
              25,
              22
            ]
          }
        },
        {
          "column": 22,
          "row": 2,
          "rect": [
            704,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            3,
            23,
            29
          ],
          "opaque": 342,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                1,
                6
              ]
            ]
          },
          "sockets": {
            "charge": [
              6,
              21
            ]
          }
        },
        {
          "column": 22,
          "row": 3,
          "rect": [
            704,
            128,
            32,
            32
          ],
          "bounds": [
            5,
            1,
            22,
            31
          ],
          "opaque": 377,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                20
              ]
            ]
          },
          "sockets": {
            "charge": [
              23,
              23
            ]
          }
        },
        {
          "column": 23,
          "row": 0,
          "rect": [
            736,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            32
          ],
          "opaque": 388,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              23
            ]
          }
        },
        {
          "column": 23,
          "row": 1,
          "rect": [
            736,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            27,
            31
          ],
          "opaque": 380,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                25,
                30
              ]
            ]
          },
          "sockets": {
            "beam": [
              5,
              17
            ]
          }
        },
        {
          "column": 23,
          "row": 2,
          "rect": [
            736,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            1,
            27,
            31
          ],
          "opaque": 380,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                1,
                6
              ]
            ]
          },
          "sockets": {
            "beam": [
              26,
              17
            ]
          }
        },
        {
          "column": 23,
          "row": 3,
          "rect": [
            736,
            128,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            32
          ],
          "opaque": 385,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                21
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              6
            ],
            "beamBehindBody": true
          }
        },
        {
          "column": 24,
          "row": 0,
          "rect": [
            768,
            32,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            20,
            32
          ],
          "opaque": 371,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              23
            ]
          }
        },
        {
          "column": 24,
          "row": 1,
          "rect": [
            768,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            27,
            32
          ],
          "opaque": 379,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                25,
                30
              ]
            ]
          },
          "sockets": {
            "beam": [
              5,
              16
            ]
          }
        },
        {
          "column": 24,
          "row": 2,
          "rect": [
            768,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            0,
            27,
            32
          ],
          "opaque": 379,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                1,
                6
              ]
            ]
          },
          "sockets": {
            "beam": [
              26,
              16
            ]
          }
        },
        {
          "column": 24,
          "row": 3,
          "rect": [
            768,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            24,
            31
          ],
          "opaque": 386,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                21
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              6
            ],
            "beamBehindBody": true
          }
        },
        {
          "column": 25,
          "row": 0,
          "rect": [
            800,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            31
          ],
          "opaque": 403,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 25,
          "row": 1,
          "rect": [
            800,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            2,
            25,
            30
          ],
          "opaque": 388,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                26,
                29
              ]
            ]
          }
        },
        {
          "column": 25,
          "row": 2,
          "rect": [
            800,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            2,
            25,
            30
          ],
          "opaque": 388,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                2,
                5
              ]
            ]
          }
        },
        {
          "column": 25,
          "row": 3,
          "rect": [
            800,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            31
          ],
          "opaque": 388,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 26,
          "row": 0,
          "rect": [
            832,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            22,
            31
          ],
          "opaque": 211,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                11,
                11
              ]
            ]
          }
        },
        {
          "column": 26,
          "row": 1,
          "rect": [
            832,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            1,
            24,
            31
          ],
          "opaque": 224,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                26,
                26
              ],
              [
                28,
                28
              ]
            ]
          }
        },
        {
          "column": 26,
          "row": 2,
          "rect": [
            832,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            1,
            24,
            31
          ],
          "opaque": 224,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                3
              ],
              [
                5,
                5
              ]
            ]
          }
        },
        {
          "column": 26,
          "row": 3,
          "rect": [
            832,
            128,
            32,
            32
          ],
          "bounds": [
            5,
            1,
            22,
            31
          ],
          "opaque": 212,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                16
              ],
              [
                18,
                18
              ]
            ]
          }
        },
        {
          "column": 27,
          "row": 0,
          "rect": [
            864,
            32,
            32,
            32
          ],
          "bounds": [
            13,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                15
              ]
            ]
          }
        },
        {
          "column": 27,
          "row": 1,
          "rect": [
            864,
            64,
            32,
            32
          ],
          "bounds": [
            13,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                15
              ]
            ]
          }
        },
        {
          "column": 27,
          "row": 2,
          "rect": [
            864,
            96,
            32,
            32
          ],
          "bounds": [
            12,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                16
              ]
            ]
          }
        },
        {
          "column": 27,
          "row": 3,
          "rect": [
            864,
            128,
            32,
            32
          ],
          "bounds": [
            13,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                15
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 0,
          "rect": [
            896,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            32
          ],
          "opaque": 393,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                14
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 1,
          "rect": [
            896,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            1,
            23,
            30
          ],
          "opaque": 365,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                18
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 2,
          "rect": [
            896,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            23,
            30
          ],
          "opaque": 365,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                18
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 3,
          "rect": [
            896,
            128,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            25,
            31
          ],
          "opaque": 380,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                16
              ]
            ]
          }
        },
        {
          "column": 29,
          "row": 0,
          "rect": [
            928,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            24,
            31
          ],
          "opaque": 393,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                19,
                23
              ]
            ]
          },
          "sockets": {
            "ki": [
              19,
              28
            ]
          }
        },
        {
          "column": 29,
          "row": 1,
          "rect": [
            928,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            1,
            26,
            30
          ],
          "opaque": 382,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                22,
                25
              ]
            ]
          },
          "sockets": {
            "ki": [
              1,
              15
            ]
          }
        },
        {
          "column": 29,
          "row": 2,
          "rect": [
            928,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            1,
            26,
            30
          ],
          "opaque": 382,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                6,
                9
              ]
            ]
          },
          "sockets": {
            "ki": [
              30,
              15
            ]
          }
        },
        {
          "column": 29,
          "row": 3,
          "rect": [
            928,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            32
          ],
          "opaque": 394,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                14
              ]
            ]
          },
          "sockets": {
            "ki": [
              21,
              1
            ],
            "kiBehindBody": true
          }
        },
        {
          "column": 30,
          "row": 0,
          "rect": [
            960,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            2,
            25,
            30
          ],
          "opaque": 399,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                19,
                23
              ]
            ]
          },
          "sockets": {
            "ki": [
              13,
              27
            ]
          }
        },
        {
          "column": 30,
          "row": 1,
          "rect": [
            960,
            64,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            24,
            30
          ],
          "opaque": 374,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                22,
                25
              ]
            ]
          },
          "sockets": {
            "ki": [
              3,
              16
            ]
          }
        },
        {
          "column": 30,
          "row": 2,
          "rect": [
            960,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            1,
            24,
            30
          ],
          "opaque": 374,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                6,
                9
              ]
            ]
          },
          "sockets": {
            "ki": [
              28,
              16
            ]
          }
        },
        {
          "column": 30,
          "row": 3,
          "rect": [
            960,
            128,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            32
          ],
          "opaque": 399,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                14
              ]
            ]
          },
          "sockets": {
            "ki": [
              10,
              1
            ],
            "kiBehindBody": true
          }
        },
        {
          "column": 31,
          "row": 0,
          "rect": [
            992,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            3,
            25,
            29
          ],
          "opaque": 352,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          }
        },
        {
          "column": 31,
          "row": 1,
          "rect": [
            992,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            23,
            31
          ],
          "opaque": 368,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          }
        },
        {
          "column": 31,
          "row": 2,
          "rect": [
            992,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            1,
            23,
            31
          ],
          "opaque": 368,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 31,
          "row": 3,
          "rect": [
            992,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            31
          ],
          "opaque": 384,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 0,
          "rect": [
            1024,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            30
          ],
          "opaque": 405,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 1,
          "rect": [
            1024,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            24,
            32
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 2,
          "rect": [
            1024,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            0,
            24,
            32
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                15
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 3,
          "rect": [
            1024,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 405,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 0,
          "rect": [
            1056,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            30
          ],
          "opaque": 381,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                15,
                16
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 1,
          "rect": [
            1056,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            26,
            32
          ],
          "opaque": 384,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                20
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 2,
          "rect": [
            1056,
            96,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            26,
            32
          ],
          "opaque": 384,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                11,
                13
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 3,
          "rect": [
            1056,
            128,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            24,
            31
          ],
          "opaque": 434,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 0,
          "rect": [
            1088,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            31
          ],
          "opaque": 402,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 1,
          "rect": [
            1088,
            64,
            32,
            32
          ],
          "bounds": [
            9,
            0,
            22,
            32
          ],
          "opaque": 317,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 2,
          "rect": [
            1088,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            0,
            22,
            32
          ],
          "opaque": 317,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 3,
          "rect": [
            1088,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 425,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 0,
          "rect": [
            1120,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            30
          ],
          "opaque": 392,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                13,
                14
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 1,
          "rect": [
            1120,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            32
          ],
          "opaque": 301,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                17
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 2,
          "rect": [
            1120,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            32
          ],
          "opaque": 301,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                14,
                16
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 3,
          "rect": [
            1120,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 413,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 0,
          "rect": [
            1152,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 434,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 1,
          "rect": [
            1152,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            23,
            32
          ],
          "opaque": 310,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                18
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 2,
          "rect": [
            1152,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            23,
            32
          ],
          "opaque": 310,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 3,
          "rect": [
            1152,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 436,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 0,
          "rect": [
            1184,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            3,
            25,
            28
          ],
          "opaque": 387,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                21
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 1,
          "rect": [
            1184,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            2,
            23,
            30
          ],
          "opaque": 317,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 2,
          "rect": [
            1184,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            2,
            23,
            30
          ],
          "opaque": 317,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                15
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 3,
          "rect": [
            1184,
            128,
            32,
            32
          ],
          "bounds": [
            3,
            2,
            25,
            30
          ],
          "opaque": 395,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 0,
          "rect": [
            1216,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            23,
            30
          ],
          "opaque": 384,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 1,
          "rect": [
            1216,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            21,
            32
          ],
          "opaque": 349,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                21,
                22
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 2,
          "rect": [
            1216,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            21,
            32
          ],
          "opaque": 349,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                10
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 3,
          "rect": [
            1216,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            32
          ],
          "opaque": 397,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                11,
                13
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 0,
          "rect": [
            1248,
            32,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            20,
            32
          ],
          "opaque": 353,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 1,
          "rect": [
            1248,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            19,
            32
          ],
          "opaque": 293,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                18
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 2,
          "rect": [
            1248,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            19,
            32
          ],
          "opaque": 293,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 3,
          "rect": [
            1248,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            32
          ],
          "opaque": 394,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 0,
          "rect": [
            1280,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            5,
            24,
            21
          ],
          "opaque": 303,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 1,
          "rect": [
            1280,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            7,
            31,
            17
          ],
          "opaque": 313,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                24
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 2,
          "rect": [
            1280,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            31,
            17
          ],
          "opaque": 313,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                7,
                29
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 3,
          "rect": [
            1280,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            2,
            25,
            24
          ],
          "opaque": 314,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 41,
          "row": 0,
          "rect": [
            1312,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            5,
            25,
            21
          ],
          "opaque": 302,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 41,
          "row": 1,
          "rect": [
            1312,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            5,
            31,
            19
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                25
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 41,
          "row": 2,
          "rect": [
            1312,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            5,
            31,
            19
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                6,
                29
              ]
            ]
          }
        },
        {
          "column": 41,
          "row": 3,
          "rect": [
            1312,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            2,
            25,
            24
          ],
          "opaque": 318,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 42,
          "row": 0,
          "rect": [
            1344,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            4,
            25,
            22
          ],
          "opaque": 307,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 42,
          "row": 1,
          "rect": [
            1344,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            5,
            30,
            19
          ],
          "opaque": 316,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                24
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 42,
          "row": 2,
          "rect": [
            1344,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            5,
            30,
            19
          ],
          "opaque": 316,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                7,
                29
              ]
            ]
          }
        },
        {
          "column": 42,
          "row": 3,
          "rect": [
            1344,
            128,
            32,
            32
          ],
          "bounds": [
            5,
            1,
            24,
            25
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 43,
          "row": 0,
          "rect": [
            1376,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            5,
            25,
            21
          ],
          "opaque": 302,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 43,
          "row": 1,
          "rect": [
            1376,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            7,
            31,
            17
          ],
          "opaque": 313,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                25
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 43,
          "row": 2,
          "rect": [
            1376,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            31,
            17
          ],
          "opaque": 313,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                6,
                29
              ]
            ]
          }
        },
        {
          "column": 43,
          "row": 3,
          "rect": [
            1376,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            2,
            25,
            24
          ],
          "opaque": 318,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 44,
          "row": 0,
          "rect": [
            1408,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            4,
            23,
            25
          ],
          "opaque": 327,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 44,
          "row": 1,
          "rect": [
            1408,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            4,
            23,
            25
          ],
          "opaque": 327,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 44,
          "row": 2,
          "rect": [
            1408,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            22,
            27
          ],
          "opaque": 309,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                17,
                18
              ]
            ]
          }
        },
        {
          "column": 44,
          "row": 3,
          "rect": [
            1408,
            128,
            32,
            32
          ],
          "bounds": [
            6,
            1,
            22,
            27
          ],
          "opaque": 309,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 45,
          "row": 0,
          "rect": [
            1440,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            4,
            23,
            25
          ],
          "opaque": 327,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 45,
          "row": 1,
          "rect": [
            1440,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            4,
            23,
            25
          ],
          "opaque": 327,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 45,
          "row": 2,
          "rect": [
            1440,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            21,
            28
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                17,
                18
              ]
            ]
          }
        },
        {
          "column": 45,
          "row": 3,
          "rect": [
            1440,
            128,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            21,
            28
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 46,
          "row": 0,
          "rect": [
            1472,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            4,
            23,
            25
          ],
          "opaque": 329,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 46,
          "row": 1,
          "rect": [
            1472,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            4,
            23,
            25
          ],
          "opaque": 329,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 46,
          "row": 2,
          "rect": [
            1472,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            20,
            28
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                17,
                18
              ]
            ]
          }
        },
        {
          "column": 46,
          "row": 3,
          "rect": [
            1472,
            128,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            20,
            28
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 47,
          "row": 0,
          "rect": [
            1504,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            4,
            23,
            25
          ],
          "opaque": 327,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 47,
          "row": 1,
          "rect": [
            1504,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            4,
            23,
            25
          ],
          "opaque": 327,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 28,
            "spans": [
              [
                14,
                17
              ]
            ]
          }
        },
        {
          "column": 47,
          "row": 2,
          "rect": [
            1504,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            21,
            28
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                17,
                18
              ]
            ]
          }
        },
        {
          "column": 47,
          "row": 3,
          "rect": [
            1504,
            128,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            21,
            28
          ],
          "opaque": 315,
          "origin": [
            16,
            16
          ],
          "semantic": "diagonalFlight",
          "lowestOpaque": {
            "y": 27,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 48,
          "row": 0,
          "rect": [
            1536,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            3,
            25,
            28
          ],
          "opaque": 379,
          "origin": [
            16,
            31
          ],
          "semantic": "tensedStance",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                14
              ]
            ]
          }
        },
        {
          "column": 48,
          "row": 1,
          "rect": [
            1536,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            23,
            32
          ],
          "opaque": 315,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownStance",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 48,
          "row": 2,
          "rect": [
            1536,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            23,
            32
          ],
          "opaque": 315,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownStance",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                15
              ]
            ]
          }
        },
        {
          "column": 48,
          "row": 3,
          "rect": [
            1536,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 49,
          "row": 0,
          "rect": [
            1568,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 384,
          "origin": [
            16,
            31
          ],
          "semantic": "overheadArms",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                13
              ],
              [
                19,
                21
              ]
            ]
          }
        },
        {
          "column": 49,
          "row": 1,
          "rect": [
            1568,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            2,
            25,
            28
          ],
          "opaque": 330,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownAirborne",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                21,
                22
              ],
              [
                26,
                28
              ]
            ]
          }
        },
        {
          "column": 49,
          "row": 2,
          "rect": [
            1568,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            2,
            25,
            28
          ],
          "opaque": 330,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownAirborne",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                3,
                5
              ],
              [
                9,
                10
              ]
            ]
          }
        },
        {
          "column": 49,
          "row": 3,
          "rect": [
            1568,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 50,
          "row": 0,
          "rect": [
            1600,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            4,
            25,
            27
          ],
          "opaque": 374,
          "origin": [
            16,
            31
          ],
          "semantic": "kneel",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                15
              ]
            ]
          }
        },
        {
          "column": 50,
          "row": 1,
          "rect": [
            1600,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            15,
            31,
            17
          ],
          "opaque": 323,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownImpact",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                5
              ],
              [
                8,
                9
              ]
            ]
          }
        },
        {
          "column": 50,
          "row": 2,
          "rect": [
            1600,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            15,
            31,
            17
          ],
          "opaque": 323,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownImpact",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                22,
                23
              ],
              [
                26,
                28
              ]
            ]
          }
        },
        {
          "column": 50,
          "row": 3,
          "rect": [
            1600,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 51,
          "row": 0,
          "rect": [
            1632,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            7,
            25,
            24
          ],
          "opaque": 320,
          "origin": [
            16,
            31
          ],
          "semantic": "handsOnGroundHigh",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                10
              ],
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 51,
          "row": 1,
          "rect": [
            1632,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            14,
            31,
            18
          ],
          "opaque": 341,
          "origin": [
            16,
            31
          ],
          "semantic": "prone",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                11
              ],
              [
                22,
                24
              ],
              [
                28,
                30
              ]
            ]
          }
        },
        {
          "column": 51,
          "row": 2,
          "rect": [
            1632,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            14,
            31,
            18
          ],
          "opaque": 341,
          "origin": [
            16,
            31
          ],
          "semantic": "prone",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                1,
                3
              ],
              [
                7,
                9
              ],
              [
                20,
                28
              ]
            ]
          }
        },
        {
          "column": 51,
          "row": 3,
          "rect": [
            1632,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 52,
          "row": 0,
          "rect": [
            1664,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            9,
            25,
            22
          ],
          "opaque": 324,
          "origin": [
            16,
            31
          ],
          "semantic": "handsOnGroundLow",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                10
              ],
              [
                13,
                14
              ],
              [
                18,
                19
              ],
              [
                22,
                22
              ]
            ]
          }
        },
        {
          "column": 52,
          "row": 1,
          "rect": [
            1664,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 417,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance0",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 52,
          "row": 2,
          "rect": [
            1664,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 417,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance0",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 52,
          "row": 3,
          "rect": [
            1664,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 53,
          "row": 0,
          "rect": [
            1696,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            7,
            25,
            24
          ],
          "opaque": 333,
          "origin": [
            16,
            31
          ],
          "semantic": "handsOnGroundHigh",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                10
              ],
              [
                13,
                14
              ],
              [
                18,
                19
              ],
              [
                22,
                22
              ]
            ]
          }
        },
        {
          "column": 53,
          "row": 1,
          "rect": [
            1696,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 400,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance1",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                7,
                10
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 53,
          "row": 2,
          "rect": [
            1696,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 400,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance1",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                21,
                24
              ]
            ]
          }
        },
        {
          "column": 53,
          "row": 3,
          "rect": [
            1696,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 54,
          "row": 0,
          "rect": [
            1728,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            3,
            25,
            28
          ],
          "opaque": 405,
          "origin": [
            16,
            31
          ],
          "semantic": "transformBrace",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ],
              [
                17,
                22
              ]
            ]
          }
        },
        {
          "column": 54,
          "row": 1,
          "rect": [
            1728,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 375,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance2",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                12
              ],
              [
                18,
                20
              ]
            ]
          }
        },
        {
          "column": 54,
          "row": 2,
          "rect": [
            1728,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 375,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance2",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                13
              ],
              [
                19,
                21
              ]
            ]
          }
        },
        {
          "column": 54,
          "row": 3,
          "rect": [
            1728,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 55,
          "row": 0,
          "rect": [
            1760,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            32
          ],
          "opaque": 437,
          "origin": [
            16,
            31
          ],
          "semantic": "transformStrain",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                7,
                9
              ],
              [
                11,
                11
              ],
              [
                14,
                14
              ],
              [
                17,
                18
              ],
              [
                20,
                25
              ]
            ]
          }
        },
        {
          "column": 55,
          "row": 1,
          "rect": [
            1760,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 399,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance3",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                9,
                12
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 55,
          "row": 2,
          "rect": [
            1760,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 399,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance3",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                19,
                22
              ]
            ]
          }
        },
        {
          "column": 55,
          "row": 3,
          "rect": [
            1760,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 56,
          "row": 0,
          "rect": [
            1792,
            32,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            32,
            32
          ],
          "opaque": 445,
          "origin": [
            16,
            31
          ],
          "semantic": "transformGoldFlareA",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                5
              ],
              [
                7,
                7
              ],
              [
                24,
                29
              ]
            ]
          }
        },
        {
          "column": 56,
          "row": 1,
          "rect": [
            1792,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            26,
            30
          ],
          "opaque": 397,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance4",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                7,
                10
              ],
              [
                20,
                23
              ]
            ]
          }
        },
        {
          "column": 56,
          "row": 2,
          "rect": [
            1792,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            26,
            30
          ],
          "opaque": 397,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance4",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                11
              ],
              [
                21,
                24
              ]
            ]
          }
        },
        {
          "column": 56,
          "row": 3,
          "rect": [
            1792,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 57,
          "row": 0,
          "rect": [
            1824,
            32,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            32,
            32
          ],
          "opaque": 440,
          "origin": [
            16,
            31
          ],
          "semantic": "transformGoldFlareB",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                2,
                13
              ],
              [
                16,
                20
              ],
              [
                22,
                24
              ],
              [
                26,
                28
              ]
            ]
          }
        },
        {
          "column": 57,
          "row": 1,
          "rect": [
            1824,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            30
          ],
          "opaque": 380,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance5",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 57,
          "row": 2,
          "rect": [
            1824,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            25,
            30
          ],
          "opaque": 380,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance5",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ]
            ]
          }
        },
        {
          "column": 57,
          "row": 3,
          "rect": [
            1824,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 58,
          "row": 0,
          "rect": [
            1856,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            16,
            29
          ],
          "opaque": 342,
          "origin": [
            16,
            31
          ],
          "semantic": "transformGoldSettled",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                14
              ],
              [
                18,
                22
              ]
            ]
          }
        },
        {
          "column": 58,
          "row": 1,
          "rect": [
            1856,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 371,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance6",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 58,
          "row": 2,
          "rect": [
            1856,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 371,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance6",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                15
              ]
            ]
          }
        },
        {
          "column": 58,
          "row": 3,
          "rect": [
            1856,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 59,
          "row": 0,
          "rect": [
            1888,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 59,
          "row": 1,
          "rect": [
            1888,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            25,
            31
          ],
          "opaque": 375,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance7",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 59,
          "row": 2,
          "rect": [
            1888,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            25,
            31
          ],
          "opaque": 375,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance7",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 59,
          "row": 3,
          "rect": [
            1888,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 60,
          "row": 0,
          "rect": [
            1920,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 60,
          "row": 1,
          "rect": [
            1920,
            64,
            32,
            32
          ],
          "bounds": [
            2,
            0,
            30,
            31
          ],
          "opaque": 413,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance8",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                23
              ]
            ]
          }
        },
        {
          "column": 60,
          "row": 2,
          "rect": [
            1920,
            96,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            30,
            31
          ],
          "opaque": 413,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance8",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                12
              ]
            ]
          }
        },
        {
          "column": 60,
          "row": 3,
          "rect": [
            1920,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 61,
          "row": 0,
          "rect": [
            1952,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 61,
          "row": 1,
          "rect": [
            1952,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            2,
            26,
            29
          ],
          "opaque": 407,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance9",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                22,
                26
              ]
            ]
          }
        },
        {
          "column": 61,
          "row": 2,
          "rect": [
            1952,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            2,
            26,
            29
          ],
          "opaque": 407,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance9",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                5,
                9
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 61,
          "row": 3,
          "rect": [
            1952,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 62,
          "row": 0,
          "rect": [
            1984,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 62,
          "row": 1,
          "rect": [
            1984,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            4,
            27,
            27
          ],
          "opaque": 386,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance10",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                22,
                26
              ]
            ]
          }
        },
        {
          "column": 62,
          "row": 2,
          "rect": [
            1984,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            4,
            27,
            27
          ],
          "opaque": 386,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance10",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                5,
                9
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 62,
          "row": 3,
          "rect": [
            1984,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        }
      ],
      "clips": {
        "idle": {
          "frames": [
            {
              "column": 0,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "notes": "Hold the open-eye cell. Blinking is a separate brief action, never a 50/50 two-frame idle loop."
        },
        "blink": {
          "frames": [
            {
              "column": 1,
              "ticks": 5
            }
          ],
          "loop": false,
          "validRows": [
            0,
            1,
            2
          ],
          "fallback": "idle",
          "notes": "The up-facing blink cell is empty in both sheets."
        },
        "walk": {
          "frames": [
            {
              "column": 2,
              "ticks": 6
            },
            {
              "column": 3,
              "ticks": 6
            },
            {
              "column": 4,
              "ticks": 6
            },
            {
              "column": 5,
              "ticks": 6
            }
          ],
          "loop": true
        },
        "run": {
          "frames": [
            {
              "column": 6,
              "ticks": 4
            },
            {
              "column": 7,
              "ticks": 4
            },
            {
              "column": 8,
              "ticks": 4
            },
            {
              "column": 9,
              "ticks": 4
            }
          ],
          "loop": true
        },
        "punch": {
          "frames": [
            {
              "column": 10,
              "ticks": 4
            },
            {
              "column": 11,
              "ticks": 3
            },
            {
              "column": 12,
              "ticks": 3
            },
            {
              "column": 13,
              "ticks": 5
            }
          ],
          "loop": false,
          "hitFrames": [
            1,
            2
          ],
          "comboSlot": 0
        },
        "cross": {
          "frames": [
            {
              "column": 14,
              "ticks": 4
            },
            {
              "column": 15,
              "ticks": 3
            },
            {
              "column": 16,
              "ticks": 3
            },
            {
              "column": 17,
              "ticks": 5
            }
          ],
          "loop": false,
          "hitFrames": [
            1,
            2
          ],
          "comboSlot": 1
        },
        "kick": {
          "frames": [
            {
              "column": 18,
              "ticks": 5
            },
            {
              "column": 19,
              "ticks": 4
            },
            {
              "column": 20,
              "ticks": 3
            },
            {
              "column": 21,
              "ticks": 6
            }
          ],
          "loop": false,
          "hitFrames": [
            1,
            2
          ],
          "comboSlot": 2
        },
        "chargeWindup": {
          "frames": [
            {
              "column": 22,
              "ticks": 4
            }
          ],
          "loop": false
        },
        "charge": {
          "frames": [
            {
              "column": 22,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "notes": "Cupped hands remain at the hip. Animate the energy effect; do not cycle into the extended-palm release cells."
        },
        "beam": {
          "frames": [
            {
              "column": 23,
              "ticks": 4
            },
            {
              "column": 24,
              "ticks": 8
            },
            {
              "column": 25,
              "ticks": 6
            }
          ],
          "loop": false,
          "emitFrames": [
            0
          ],
          "notes": "23/24 are the two extended-palm release poses; 25 is a guard pose reused for recovery."
        },
        "beamHold": {
          "frames": [
            {
              "column": 23,
              "ticks": 4
            },
            {
              "column": 24,
              "ticks": 4
            }
          ],
          "loop": true
        },
        "beamRecovery": {
          "frames": [
            {
              "column": 25,
              "ticks": 6
            }
          ],
          "loop": false
        },
        "blast": {
          "frames": [
            {
              "column": 28,
              "ticks": 4
            },
            {
              "column": 29,
              "ticks": 3
            },
            {
              "column": 30,
              "ticks": 3
            },
            {
              "column": 31,
              "ticks": 5
            }
          ],
          "loop": false,
          "emitFrames": [
            1,
            2
          ],
          "notes": "A separate alternating one-palm ki volley. To emit only one projectile, choose one of the two emit frames and retain the recovery."
        },
        "guard": {
          "frames": [
            {
              "column": 25,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true
        },
        "hurt": {
          "frames": [
            {
              "column": 32,
              "ticks": 7
            },
            {
              "column": 34,
              "ticks": 7
            }
          ],
          "loop": false,
          "notes": "Visible sweat/flinch, then braced recovery. Strong knockback uses airKnockback/fall instead."
        },
        "airKnockback": {
          "frames": [
            {
              "column": 32,
              "ticks": 4
            },
            {
              "column": 33,
              "ticks": 10
            },
            {
              "column": 34,
              "ticks": 7
            }
          ],
          "loop": false
        },
        "brace": {
          "frames": [
            {
              "column": 34,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true
        },
        "jump": {
          "frames": [
            {
              "column": 37,
              "ticks": 5
            },
            {
              "column": 38,
              "ticks": 5
            },
            {
              "column": 39,
              "ticks": 6
            }
          ],
          "loop": false,
          "notes": "Crouch, lifted knee, raised-arm ascent. Host supplies actual height; the source cells have no trajectory metadata."
        },
        "land": {
          "frames": [
            {
              "column": 39,
              "ticks": 3
            },
            {
              "column": 38,
              "ticks": 3
            },
            {
              "column": 37,
              "ticks": 5
            },
            {
              "column": 36,
              "ticks": 4
            }
          ],
          "loop": false,
          "adaptation": true,
          "notes": "Authored reverse takeoff followed by the source standing cell."
        },
        "fall": {
          "frames": [
            {
              "column": 48,
              "ticks": 3
            },
            {
              "column": 49,
              "ticks": 7
            },
            {
              "column": 50,
              "ticks": 5
            },
            {
              "column": 51,
              "ticks": 10
            }
          ],
          "loop": false,
          "rowByFacing": {
            "down": 1,
            "right": 2,
            "left": 1,
            "up": 1
          },
          "sourceGap": "Only left/right source poses. Down/up intentionally use left-facing art; retaining the last horizontal direction is another valid adapter choice.",
          "holdLast": true
        },
        "dead": {
          "frames": [
            {
              "column": 51,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "rowByFacing": {
            "down": 1,
            "right": 2,
            "left": 1,
            "up": 1
          },
          "sourceGap": "Only left/right source poses. Down/up intentionally use left-facing art; retaining the last horizontal direction is another valid adapter choice."
        },
        "sleep": {
          "frames": [
            {
              "column": 51,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "rowByFacing": {
            "down": 1,
            "right": 2,
            "left": 1,
            "up": 1
          },
          "sourceGap": "Only left/right source poses. Down/up intentionally use left-facing art; retaining the last horizontal direction is another valid adapter choice.",
          "adaptation": true,
          "notes": "The supplied sheet has prone/resting art, but no separate sleep breathing loop."
        },
        "celebrate": {
          "frames": [
            {
              "column": 35,
              "ticks": 24
            },
            {
              "column": 36,
              "ticks": 6
            }
          ],
          "loop": false,
          "notes": "Raised-arms pose reused as a celebration; no dedicated multi-frame victory strip is present."
        },
        "flight": {
          "frames": [
            {
              "column": 40,
              "ticks": 7
            },
            {
              "column": 41,
              "ticks": 7
            },
            {
              "column": 42,
              "ticks": 7
            },
            {
              "column": 43,
              "ticks": 7
            }
          ],
          "loop": true,
          "origin": [
            16,
            16
          ]
        },
        "flightDiagonal": {
          "frames": [
            {
              "column": 44,
              "ticks": 7
            },
            {
              "column": 45,
              "ticks": 7
            },
            {
              "column": 46,
              "ticks": 7
            },
            {
              "column": 47,
              "ticks": 7
            }
          ],
          "loop": true,
          "origin": [
            16,
            16
          ],
          "rowByDirection": {
            "southEast": 0,
            "southWest": 1,
            "northEast": 2,
            "northWest": 3
          },
          "notes": "These four physical rows are diagonal headings, not the cardinal row layout."
        },
        "transform": {
          "frames": [
            {
              "column": 54,
              "ticks": 6,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 55,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 56,
              "ticks": 5,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 57,
              "ticks": 5,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 56,
              "ticks": 4,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 57,
              "ticks": 4,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 58,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            }
          ],
          "loop": false,
          "visibleFormChangeFrame": 2,
          "endsForm": "ssj",
          "notes": "The real front-facing base-to-gold sequence. It includes source dust pixels. No side/back transformation art exists."
        },
        "revert": {
          "frames": [
            {
              "column": 47,
              "ticks": 5,
              "sheet": "ssj",
              "row": 0
            },
            {
              "column": 48,
              "ticks": 5,
              "sheet": "ssj",
              "row": 0
            },
            {
              "column": 49,
              "ticks": 5,
              "sheet": "ssj",
              "row": 0
            },
            {
              "column": 50,
              "ticks": 8,
              "sheet": "ssj",
              "row": 0
            }
          ],
          "loop": false,
          "endsForm": "goku",
          "notes": "Use the SSJ sheet even if the gameplay flag has already switched off."
        },
        "push": {
          "frames": [
            {
              "column": 23,
              "ticks": 8
            },
            {
              "column": 24,
              "ticks": 8
            }
          ],
          "loop": true,
          "adaptation": true,
          "notes": "Two-palm extended beam art reused as a shove/push. There is no dedicated walking push strip."
        },
        "swordLift": {
          "frames": [
            {
              "column": 49,
              "ticks": 24,
              "sheet": "goku",
              "row": 0
            }
          ],
          "loop": false,
          "holdLast": true,
          "adaptation": true,
          "notes": "Both arms fully overhead. The sheet contains no sword or other held object."
        },
        "swordPull": {
          "frames": [
            {
              "column": 22,
              "ticks": 8
            },
            {
              "column": 34,
              "ticks": 8
            }
          ],
          "loop": true,
          "adaptation": true,
          "notes": "Cupped-hand and bracing poses are only a scripted analog. Preserve original BOY during the actual opening sword pull."
        },
        "kneel": {
          "frames": [
            {
              "column": 50,
              "ticks": 1,
              "sheet": "goku",
              "row": 0
            }
          ],
          "loop": false,
          "holdLast": true
        },
        "pushUp": {
          "frames": [
            {
              "column": 51,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 52,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 53,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 52,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            }
          ],
          "loop": true,
          "notes": "Front-only low, hands-on-ground exercise poses; unrelated to the side-row knockdown/fusion art in these columns."
        },
        "teleport": {
          "frames": [
            {
              "column": 26,
              "ticks": 4
            },
            {
              "column": 27,
              "ticks": 4
            }
          ],
          "loop": false,
          "notes": "Two vertical disappearance-streak cells. Reverse these for materialization; no fully blank cell is needed from the sheet."
        }
      },
      "sockets": {
        "22": [
          [
            13,
            21
          ],
          [
            25,
            22
          ],
          [
            6,
            21
          ],
          [
            23,
            23
          ]
        ],
        "23": [
          [
            16,
            23
          ],
          [
            5,
            17
          ],
          [
            26,
            17
          ],
          [
            16,
            6
          ]
        ],
        "24": [
          [
            16,
            23
          ],
          [
            5,
            16
          ],
          [
            26,
            16
          ],
          [
            16,
            6
          ]
        ],
        "29": [
          [
            19,
            28
          ],
          [
            1,
            15
          ],
          [
            30,
            15
          ],
          [
            21,
            1
          ]
        ],
        "30": [
          [
            13,
            27
          ],
          [
            3,
            16
          ],
          [
            28,
            16
          ],
          [
            10,
            1
          ]
        ]
      }
    },
    "ssj": {
      "sheet": "ssj",
      "source": "assets/source/ssj.png",
      "prepared": "assets/sprites/ssj.png",
      "width": 1760,
      "height": 192,
      "columns": 55,
      "cells": [
        {
          "column": 0,
          "row": 0,
          "rect": [
            0,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 367,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 0,
          "row": 1,
          "rect": [
            0,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 296,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 0,
          "row": 2,
          "rect": [
            0,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 296,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                18
              ]
            ]
          }
        },
        {
          "column": 0,
          "row": 3,
          "rect": [
            0,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 373,
          "origin": [
            16,
            31
          ],
          "semantic": "idle",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 0,
          "rect": [
            32,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 367,
          "origin": [
            16,
            31
          ],
          "semantic": "blink",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 1,
          "rect": [
            32,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 296,
          "origin": [
            16,
            31
          ],
          "semantic": "blink",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 2,
          "rect": [
            32,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 296,
          "origin": [
            16,
            31
          ],
          "semantic": "blink",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                18
              ]
            ]
          }
        },
        {
          "column": 1,
          "row": 3,
          "rect": [
            32,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 2,
          "row": 0,
          "rect": [
            64,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            15,
            30
          ],
          "opaque": 308,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                18
              ]
            ]
          }
        },
        {
          "column": 2,
          "row": 1,
          "rect": [
            64,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            16,
            31
          ],
          "opaque": 323,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                10
              ]
            ]
          }
        },
        {
          "column": 2,
          "row": 2,
          "rect": [
            64,
            96,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            16,
            31
          ],
          "opaque": 323,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                19
              ]
            ]
          }
        },
        {
          "column": 2,
          "row": 3,
          "rect": [
            64,
            128,
            32,
            32
          ],
          "bounds": [
            7,
            2,
            16,
            30
          ],
          "opaque": 328,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                16
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 0,
          "rect": [
            96,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            30
          ],
          "opaque": 339,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 1,
          "rect": [
            96,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 294,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                18
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 2,
          "rect": [
            96,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 294,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                18
              ]
            ]
          }
        },
        {
          "column": 3,
          "row": 3,
          "rect": [
            96,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 348,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 0,
          "rect": [
            128,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            16,
            30
          ],
          "opaque": 310,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 1,
          "rect": [
            128,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 317,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                20,
                21
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 2,
          "rect": [
            128,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 317,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                11
              ]
            ]
          }
        },
        {
          "column": 4,
          "row": 3,
          "rect": [
            128,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            15,
            30
          ],
          "opaque": 320,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 0,
          "rect": [
            160,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            30
          ],
          "opaque": 339,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                15
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 1,
          "rect": [
            160,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 292,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                15,
                16
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 2,
          "rect": [
            160,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 292,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                15,
                16
              ]
            ]
          }
        },
        {
          "column": 5,
          "row": 3,
          "rect": [
            160,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 348,
          "origin": [
            16,
            31
          ],
          "semantic": "walk",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 0,
          "rect": [
            192,
            32,
            32,
            32
          ],
          "bounds": [
            9,
            4,
            15,
            28
          ],
          "opaque": 282,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 1,
          "rect": [
            192,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            1,
            20,
            30
          ],
          "opaque": 341,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                9
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 2,
          "rect": [
            192,
            96,
            32,
            32
          ],
          "bounds": [
            7,
            1,
            20,
            30
          ],
          "opaque": 341,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                22,
                23
              ]
            ]
          }
        },
        {
          "column": 6,
          "row": 3,
          "rect": [
            192,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            16,
            30
          ],
          "opaque": 316,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 0,
          "rect": [
            224,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            30
          ],
          "opaque": 333,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 1,
          "rect": [
            224,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            16,
            31
          ],
          "opaque": 326,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                15,
                20
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 2,
          "rect": [
            224,
            96,
            32,
            32
          ],
          "bounds": [
            9,
            0,
            16,
            31
          ],
          "opaque": 326,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                16
              ]
            ]
          }
        },
        {
          "column": 7,
          "row": 3,
          "rect": [
            224,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 353,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 0,
          "rect": [
            256,
            32,
            32,
            32
          ],
          "bounds": [
            9,
            3,
            15,
            29
          ],
          "opaque": 290,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 1,
          "rect": [
            256,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            24,
            29
          ],
          "opaque": 338,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                7,
                8
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 2,
          "rect": [
            256,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            24,
            29
          ],
          "opaque": 338,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                23,
                24
              ]
            ]
          }
        },
        {
          "column": 8,
          "row": 3,
          "rect": [
            256,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            15,
            30
          ],
          "opaque": 308,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 0,
          "rect": [
            288,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            30
          ],
          "opaque": 333,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                15
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 1,
          "rect": [
            288,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            17,
            30
          ],
          "opaque": 301,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                14,
                18
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 2,
          "rect": [
            288,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            17,
            30
          ],
          "opaque": 301,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                13,
                17
              ]
            ]
          }
        },
        {
          "column": 9,
          "row": 3,
          "rect": [
            288,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            30
          ],
          "opaque": 348,
          "origin": [
            16,
            31
          ],
          "semantic": "run",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 0,
          "rect": [
            320,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            18,
            31
          ],
          "opaque": 326,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                16,
                21
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 1,
          "rect": [
            320,
            64,
            32,
            32
          ],
          "bounds": [
            10,
            1,
            20,
            31
          ],
          "opaque": 380,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                18
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 2,
          "rect": [
            320,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            20,
            31
          ],
          "opaque": 380,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                19
              ]
            ]
          }
        },
        {
          "column": 10,
          "row": 3,
          "rect": [
            320,
            128,
            32,
            32
          ],
          "bounds": [
            6,
            2,
            19,
            30
          ],
          "opaque": 341,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                17
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 0,
          "rect": [
            352,
            32,
            32,
            32
          ],
          "bounds": [
            2,
            3,
            22,
            29
          ],
          "opaque": 368,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                8
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 1,
          "rect": [
            352,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            26,
            32
          ],
          "opaque": 363,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 2,
          "rect": [
            352,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            26,
            32
          ],
          "opaque": 363,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                13
              ]
            ]
          }
        },
        {
          "column": 11,
          "row": 3,
          "rect": [
            352,
            128,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            21,
            32
          ],
          "opaque": 411,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 0,
          "rect": [
            384,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            4,
            21,
            28
          ],
          "opaque": 345,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                8
              ],
              [
                12,
                18
              ],
              [
                20,
                20
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 1,
          "rect": [
            384,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            28,
            32
          ],
          "opaque": 418,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                22,
                27
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 2,
          "rect": [
            384,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            28,
            32
          ],
          "opaque": 418,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                4,
                9
              ]
            ]
          }
        },
        {
          "column": 12,
          "row": 3,
          "rect": [
            384,
            128,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            22,
            32
          ],
          "opaque": 399,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 0,
          "rect": [
            416,
            32,
            32,
            32
          ],
          "bounds": [
            3,
            3,
            23,
            29
          ],
          "opaque": 316,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                8
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 1,
          "rect": [
            416,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 359,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                19,
                22
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 2,
          "rect": [
            416,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 359,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                12
              ]
            ]
          }
        },
        {
          "column": 13,
          "row": 3,
          "rect": [
            416,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            20,
            31
          ],
          "opaque": 351,
          "origin": [
            16,
            31
          ],
          "semantic": "punch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 0,
          "rect": [
            448,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            18,
            31
          ],
          "opaque": 328,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 1,
          "rect": [
            448,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            21,
            31
          ],
          "opaque": 347,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                16
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 2,
          "rect": [
            448,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            0,
            21,
            31
          ],
          "opaque": 347,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                15,
                20
              ]
            ]
          }
        },
        {
          "column": 14,
          "row": 3,
          "rect": [
            448,
            128,
            32,
            32
          ],
          "bounds": [
            6,
            3,
            23,
            28
          ],
          "opaque": 311,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                15
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 0,
          "rect": [
            480,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            22,
            31
          ],
          "opaque": 364,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                23
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 1,
          "rect": [
            480,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            1,
            26,
            30
          ],
          "opaque": 367,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                23
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 2,
          "rect": [
            480,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            1,
            26,
            30
          ],
          "opaque": 367,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                12
              ]
            ]
          }
        },
        {
          "column": 15,
          "row": 3,
          "rect": [
            480,
            128,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            22,
            31
          ],
          "opaque": 336,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 0,
          "rect": [
            512,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            25,
            31
          ],
          "opaque": 358,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                18
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 1,
          "rect": [
            512,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            1,
            24,
            30
          ],
          "opaque": 358,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                23
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 2,
          "rect": [
            512,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            24,
            30
          ],
          "opaque": 358,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                12
              ]
            ]
          }
        },
        {
          "column": 16,
          "row": 3,
          "rect": [
            512,
            128,
            32,
            32
          ],
          "bounds": [
            2,
            0,
            25,
            31
          ],
          "opaque": 362,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 0,
          "rect": [
            544,
            32,
            32,
            32
          ],
          "bounds": [
            2,
            2,
            24,
            29
          ],
          "opaque": 324,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 1,
          "rect": [
            544,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            17,
            31
          ],
          "opaque": 313,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                15,
                19
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 2,
          "rect": [
            544,
            96,
            32,
            32
          ],
          "bounds": [
            9,
            0,
            17,
            31
          ],
          "opaque": 313,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                16
              ]
            ]
          }
        },
        {
          "column": 17,
          "row": 3,
          "rect": [
            544,
            128,
            32,
            32
          ],
          "bounds": [
            4,
            1,
            23,
            30
          ],
          "opaque": 348,
          "origin": [
            16,
            31
          ],
          "semantic": "kick",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ]
            ]
          }
        },
        {
          "column": 18,
          "row": 0,
          "rect": [
            576,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            15,
            30
          ],
          "opaque": 317,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          },
          "sockets": {
            "charge": [
              13,
              21
            ]
          }
        },
        {
          "column": 18,
          "row": 1,
          "rect": [
            576,
            64,
            32,
            32
          ],
          "bounds": [
            10,
            3,
            20,
            29
          ],
          "opaque": 333,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                24,
                29
              ]
            ]
          },
          "sockets": {
            "charge": [
              24,
              22
            ]
          }
        },
        {
          "column": 18,
          "row": 2,
          "rect": [
            576,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            3,
            20,
            29
          ],
          "opaque": 333,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                2,
                7
              ]
            ]
          },
          "sockets": {
            "charge": [
              7,
              21
            ]
          }
        },
        {
          "column": 18,
          "row": 3,
          "rect": [
            576,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 344,
          "origin": [
            16,
            31
          ],
          "semantic": "charge",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                20
              ]
            ]
          },
          "sockets": {
            "charge": [
              23,
              23
            ]
          }
        },
        {
          "column": 19,
          "row": 0,
          "rect": [
            608,
            32,
            32,
            32
          ],
          "bounds": [
            9,
            1,
            15,
            31
          ],
          "opaque": 327,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              23
            ]
          }
        },
        {
          "column": 19,
          "row": 1,
          "rect": [
            608,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            27,
            31
          ],
          "opaque": 369,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                24,
                29
              ]
            ]
          },
          "sockets": {
            "beam": [
              4,
              17
            ]
          }
        },
        {
          "column": 19,
          "row": 2,
          "rect": [
            608,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            27,
            31
          ],
          "opaque": 369,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                2,
                7
              ]
            ]
          },
          "sockets": {
            "beam": [
              27,
              17
            ]
          }
        },
        {
          "column": 19,
          "row": 3,
          "rect": [
            608,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            15,
            32
          ],
          "opaque": 333,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                21
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              6
            ],
            "beamBehindBody": true
          }
        },
        {
          "column": 20,
          "row": 0,
          "rect": [
            640,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 332,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              23
            ]
          }
        },
        {
          "column": 20,
          "row": 1,
          "rect": [
            640,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            2,
            27,
            30
          ],
          "opaque": 365,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                24,
                29
              ]
            ]
          },
          "sockets": {
            "beam": [
              4,
              16
            ]
          }
        },
        {
          "column": 20,
          "row": 2,
          "rect": [
            640,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            2,
            27,
            30
          ],
          "opaque": 365,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                2,
                7
              ]
            ]
          },
          "sockets": {
            "beam": [
              27,
              16
            ]
          }
        },
        {
          "column": 20,
          "row": 3,
          "rect": [
            640,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 355,
          "origin": [
            16,
            31
          ],
          "semantic": "beam",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                21
              ]
            ]
          },
          "sockets": {
            "beam": [
              16,
              6
            ],
            "beamBehindBody": true
          }
        },
        {
          "column": 21,
          "row": 0,
          "rect": [
            672,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 347,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 21,
          "row": 1,
          "rect": [
            672,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 354,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                20,
                23
              ]
            ]
          }
        },
        {
          "column": 21,
          "row": 2,
          "rect": [
            672,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 354,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                8,
                11
              ]
            ]
          }
        },
        {
          "column": 21,
          "row": 3,
          "rect": [
            672,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            15,
            31
          ],
          "opaque": 335,
          "origin": [
            16,
            31
          ],
          "semantic": "guard",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 22,
          "row": 0,
          "rect": [
            704,
            32,
            32,
            32
          ],
          "bounds": [
            9,
            1,
            15,
            31
          ],
          "opaque": 191,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                11,
                11
              ]
            ]
          }
        },
        {
          "column": 22,
          "row": 1,
          "rect": [
            704,
            64,
            32,
            32
          ],
          "bounds": [
            9,
            1,
            15,
            31
          ],
          "opaque": 178,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                21,
                21
              ]
            ]
          }
        },
        {
          "column": 22,
          "row": 2,
          "rect": [
            704,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            15,
            31
          ],
          "opaque": 178,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                10
              ]
            ]
          }
        },
        {
          "column": 22,
          "row": 3,
          "rect": [
            704,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            15,
            31
          ],
          "opaque": 183,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                16
              ],
              [
                18,
                18
              ]
            ]
          }
        },
        {
          "column": 23,
          "row": 0,
          "rect": [
            736,
            32,
            32,
            32
          ],
          "bounds": [
            13,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                15
              ]
            ]
          }
        },
        {
          "column": 23,
          "row": 1,
          "rect": [
            736,
            64,
            32,
            32
          ],
          "bounds": [
            13,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                15
              ]
            ]
          }
        },
        {
          "column": 23,
          "row": 2,
          "rect": [
            736,
            96,
            32,
            32
          ],
          "bounds": [
            12,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                16
              ]
            ]
          }
        },
        {
          "column": 23,
          "row": 3,
          "rect": [
            736,
            128,
            32,
            32
          ],
          "bounds": [
            13,
            1,
            7,
            31
          ],
          "opaque": 57,
          "origin": [
            16,
            31
          ],
          "semantic": "teleport",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                15
              ]
            ]
          }
        },
        {
          "column": 24,
          "row": 0,
          "rect": [
            768,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 336,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                8,
                12
              ]
            ]
          }
        },
        {
          "column": 24,
          "row": 1,
          "rect": [
            768,
            64,
            32,
            32
          ],
          "bounds": [
            10,
            1,
            20,
            30
          ],
          "opaque": 361,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                18
              ]
            ]
          }
        },
        {
          "column": 24,
          "row": 2,
          "rect": [
            768,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            20,
            30
          ],
          "opaque": 361,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                18
              ]
            ]
          }
        },
        {
          "column": 24,
          "row": 3,
          "rect": [
            768,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 320,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                16
              ]
            ]
          }
        },
        {
          "column": 25,
          "row": 0,
          "rect": [
            800,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            3,
            16,
            29
          ],
          "opaque": 315,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                19,
                23
              ]
            ]
          },
          "sockets": {
            "ki": [
              19,
              28
            ]
          }
        },
        {
          "column": 25,
          "row": 1,
          "rect": [
            800,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            2,
            26,
            29
          ],
          "opaque": 376,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                22,
                25
              ]
            ]
          },
          "sockets": {
            "ki": [
              1,
              15
            ]
          }
        },
        {
          "column": 25,
          "row": 2,
          "rect": [
            800,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            2,
            26,
            29
          ],
          "opaque": 376,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                6,
                9
              ]
            ]
          },
          "sockets": {
            "ki": [
              30,
              15
            ]
          }
        },
        {
          "column": 25,
          "row": 3,
          "rect": [
            800,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 360,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                14
              ]
            ]
          },
          "sockets": {
            "ki": [
              21,
              1
            ],
            "kiBehindBody": true
          }
        },
        {
          "column": 26,
          "row": 0,
          "rect": [
            832,
            32,
            32,
            32
          ],
          "bounds": [
            10,
            2,
            14,
            30
          ],
          "opaque": 320,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                19,
                23
              ]
            ]
          },
          "sockets": {
            "ki": [
              13,
              27
            ]
          }
        },
        {
          "column": 26,
          "row": 1,
          "rect": [
            832,
            64,
            32,
            32
          ],
          "bounds": [
            2,
            1,
            24,
            30
          ],
          "opaque": 361,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                22,
                25
              ]
            ]
          },
          "sockets": {
            "ki": [
              3,
              16
            ]
          }
        },
        {
          "column": 26,
          "row": 2,
          "rect": [
            832,
            96,
            32,
            32
          ],
          "bounds": [
            6,
            1,
            24,
            30
          ],
          "opaque": 361,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                6,
                9
              ]
            ]
          },
          "sockets": {
            "ki": [
              28,
              16
            ]
          }
        },
        {
          "column": 26,
          "row": 3,
          "rect": [
            832,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 356,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                10,
                14
              ]
            ]
          },
          "sockets": {
            "ki": [
              10,
              1
            ],
            "kiBehindBody": true
          }
        },
        {
          "column": 27,
          "row": 0,
          "rect": [
            864,
            32,
            32,
            32
          ],
          "bounds": [
            9,
            3,
            15,
            29
          ],
          "opaque": 296,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          }
        },
        {
          "column": 27,
          "row": 1,
          "rect": [
            864,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 355,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                18,
                22
              ]
            ]
          }
        },
        {
          "column": 27,
          "row": 2,
          "rect": [
            864,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 355,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                13
              ]
            ]
          }
        },
        {
          "column": 27,
          "row": 3,
          "rect": [
            864,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            15,
            31
          ],
          "opaque": 333,
          "origin": [
            16,
            31
          ],
          "semantic": "blast",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 0,
          "rect": [
            896,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            30
          ],
          "opaque": 347,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 1,
          "rect": [
            896,
            64,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            22,
            32
          ],
          "opaque": 308,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                14,
                16
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 2,
          "rect": [
            896,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            22,
            32
          ],
          "opaque": 308,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                17
              ]
            ]
          }
        },
        {
          "column": 28,
          "row": 3,
          "rect": [
            896,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 349,
          "origin": [
            16,
            31
          ],
          "semantic": "hurt",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 29,
          "row": 0,
          "rect": [
            928,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            30
          ],
          "opaque": 332,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                15,
                16
              ]
            ]
          }
        },
        {
          "column": 29,
          "row": 1,
          "rect": [
            928,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            3,
            28,
            29
          ],
          "opaque": 374,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                17
              ]
            ]
          }
        },
        {
          "column": 29,
          "row": 2,
          "rect": [
            928,
            96,
            32,
            32
          ],
          "bounds": [
            0,
            3,
            28,
            29
          ],
          "opaque": 374,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                14,
                16
              ]
            ]
          }
        },
        {
          "column": 29,
          "row": 3,
          "rect": [
            928,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 343,
          "origin": [
            16,
            31
          ],
          "semantic": "airKnockback",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 30,
          "row": 0,
          "rect": [
            960,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 349,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                14
              ]
            ]
          }
        },
        {
          "column": 30,
          "row": 1,
          "rect": [
            960,
            64,
            32,
            32
          ],
          "bounds": [
            10,
            0,
            17,
            32
          ],
          "opaque": 307,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                17
              ]
            ]
          }
        },
        {
          "column": 30,
          "row": 2,
          "rect": [
            960,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            17,
            32
          ],
          "opaque": 307,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                14,
                16
              ]
            ]
          }
        },
        {
          "column": 30,
          "row": 3,
          "rect": [
            960,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 367,
          "origin": [
            16,
            31
          ],
          "semantic": "brace",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 31,
          "row": 0,
          "rect": [
            992,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            30
          ],
          "opaque": 337,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                13,
                14
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 31,
          "row": 1,
          "rect": [
            992,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 292,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                15
              ]
            ]
          }
        },
        {
          "column": 31,
          "row": 2,
          "rect": [
            992,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 292,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                18
              ]
            ]
          }
        },
        {
          "column": 31,
          "row": 3,
          "rect": [
            992,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 368,
          "origin": [
            16,
            31
          ],
          "semantic": "raisedArms",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 0,
          "rect": [
            1024,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 367,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 1,
          "rect": [
            1024,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 296,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                16
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 2,
          "rect": [
            1024,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 296,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                18
              ]
            ]
          }
        },
        {
          "column": 32,
          "row": 3,
          "rect": [
            1024,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 373,
          "origin": [
            16,
            31
          ],
          "semantic": "standingReturn",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 0,
          "rect": [
            1056,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            3,
            16,
            28
          ],
          "opaque": 336,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                15
              ],
              [
                17,
                21
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 1,
          "rect": [
            1056,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            16,
            30
          ],
          "opaque": 306,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                14,
                16
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 2,
          "rect": [
            1056,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            2,
            16,
            30
          ],
          "opaque": 306,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                15,
                17
              ]
            ]
          }
        },
        {
          "column": 33,
          "row": 3,
          "rect": [
            1056,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 342,
          "origin": [
            16,
            31
          ],
          "semantic": "crouch",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                17,
                19
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 0,
          "rect": [
            1088,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 325,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 1,
          "rect": [
            1088,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 339,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                21,
                22
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 2,
          "rect": [
            1088,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 339,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                9,
                10
              ]
            ]
          }
        },
        {
          "column": 34,
          "row": 3,
          "rect": [
            1088,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 338,
          "origin": [
            16,
            31
          ],
          "semantic": "takeoff",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                11,
                13
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 0,
          "rect": [
            1120,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            16,
            31
          ],
          "opaque": 313,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                13,
                14
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 1,
          "rect": [
            1120,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            15,
            32
          ],
          "opaque": 275,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                17
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 2,
          "rect": [
            1120,
            96,
            32,
            32
          ],
          "bounds": [
            9,
            0,
            15,
            32
          ],
          "opaque": 275,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                14,
                15
              ]
            ]
          }
        },
        {
          "column": 35,
          "row": 3,
          "rect": [
            1120,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            32
          ],
          "opaque": 323,
          "origin": [
            16,
            31
          ],
          "semantic": "rise",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                11,
                13
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 0,
          "rect": [
            1152,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            5,
            16,
            21
          ],
          "opaque": 245,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 1,
          "rect": [
            1152,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 305,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                24
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 2,
          "rect": [
            1152,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 305,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                7,
                29
              ]
            ]
          }
        },
        {
          "column": 36,
          "row": 3,
          "rect": [
            1152,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            3,
            15,
            23
          ],
          "opaque": 247,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 0,
          "rect": [
            1184,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            5,
            16,
            21
          ],
          "opaque": 245,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 1,
          "rect": [
            1184,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 314,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                25
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 2,
          "rect": [
            1184,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 314,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                6,
                29
              ]
            ]
          }
        },
        {
          "column": 37,
          "row": 3,
          "rect": [
            1184,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            3,
            15,
            23
          ],
          "opaque": 254,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 0,
          "rect": [
            1216,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            5,
            16,
            21
          ],
          "opaque": 250,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 1,
          "rect": [
            1216,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 302,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                24
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 2,
          "rect": [
            1216,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 302,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                7,
                29
              ]
            ]
          }
        },
        {
          "column": 38,
          "row": 3,
          "rect": [
            1216,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            3,
            16,
            23
          ],
          "opaque": 250,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 0,
          "rect": [
            1248,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            5,
            16,
            21
          ],
          "opaque": 245,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                9,
                11
              ],
              [
                20,
                22
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 1,
          "rect": [
            1248,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 314,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                2,
                25
              ],
              [
                29,
                30
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 2,
          "rect": [
            1248,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            7,
            30,
            17
          ],
          "opaque": 314,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 23,
            "spans": [
              [
                1,
                2
              ],
              [
                6,
                29
              ]
            ]
          }
        },
        {
          "column": 39,
          "row": 3,
          "rect": [
            1248,
            128,
            32,
            32
          ],
          "bounds": [
            8,
            3,
            15,
            23
          ],
          "opaque": 254,
          "origin": [
            16,
            16
          ],
          "semantic": "flight",
          "lowestOpaque": {
            "y": 25,
            "spans": [
              [
                11,
                12
              ],
              [
                18,
                19
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 0,
          "rect": [
            1280,
            32,
            32,
            32
          ],
          "bounds": [
            9,
            3,
            15,
            28
          ],
          "opaque": 320,
          "origin": [
            16,
            31
          ],
          "semantic": "tensedStance",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                14
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 1,
          "rect": [
            1280,
            64,
            32,
            32
          ],
          "bounds": [
            11,
            0,
            16,
            32
          ],
          "opaque": 302,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownStance",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 2,
          "rect": [
            1280,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            16,
            32
          ],
          "opaque": 302,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownStance",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                12,
                15
              ]
            ]
          }
        },
        {
          "column": 40,
          "row": 3,
          "rect": [
            1280,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 41,
          "row": 0,
          "rect": [
            1312,
            32,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            16,
            31
          ],
          "opaque": 345,
          "origin": [
            16,
            31
          ],
          "semantic": "overheadArms",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                13
              ],
              [
                19,
                21
              ]
            ]
          }
        },
        {
          "column": 41,
          "row": 1,
          "rect": [
            1312,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            5,
            23,
            25
          ],
          "opaque": 309,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownAirborne",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                21,
                22
              ],
              [
                26,
                28
              ]
            ]
          }
        },
        {
          "column": 41,
          "row": 2,
          "rect": [
            1312,
            96,
            32,
            32
          ],
          "bounds": [
            3,
            5,
            23,
            25
          ],
          "opaque": 309,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownAirborne",
          "lowestOpaque": {
            "y": 29,
            "spans": [
              [
                3,
                5
              ],
              [
                9,
                10
              ]
            ]
          }
        },
        {
          "column": 41,
          "row": 3,
          "rect": [
            1312,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 42,
          "row": 0,
          "rect": [
            1344,
            32,
            32,
            32
          ],
          "bounds": [
            5,
            2,
            23,
            29
          ],
          "opaque": 382,
          "origin": [
            16,
            31
          ],
          "semantic": "longHairTransformBrace",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                15
              ],
              [
                17,
                22
              ]
            ]
          }
        },
        {
          "column": 42,
          "row": 1,
          "rect": [
            1344,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            12,
            30,
            20
          ],
          "opaque": 345,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownImpactFadingGold",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                5
              ],
              [
                8,
                9
              ]
            ]
          }
        },
        {
          "column": 42,
          "row": 2,
          "rect": [
            1344,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            12,
            30,
            20
          ],
          "opaque": 345,
          "origin": [
            16,
            31
          ],
          "semantic": "knockdownImpactFadingGold",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                22,
                23
              ],
              [
                26,
                28
              ]
            ]
          }
        },
        {
          "column": 42,
          "row": 3,
          "rect": [
            1344,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 43,
          "row": 0,
          "rect": [
            1376,
            32,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            24,
            32
          ],
          "opaque": 487,
          "origin": [
            16,
            31
          ],
          "semantic": "longHairTransformStrain",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                7,
                9
              ],
              [
                11,
                11
              ],
              [
                14,
                14
              ],
              [
                17,
                18
              ],
              [
                20,
                25
              ]
            ]
          }
        },
        {
          "column": 43,
          "row": 1,
          "rect": [
            1376,
            64,
            32,
            32
          ],
          "bounds": [
            1,
            14,
            30,
            18
          ],
          "opaque": 327,
          "origin": [
            16,
            31
          ],
          "semantic": "proneBlackHair",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                11
              ],
              [
                22,
                24
              ],
              [
                28,
                30
              ]
            ]
          }
        },
        {
          "column": 43,
          "row": 2,
          "rect": [
            1376,
            96,
            32,
            32
          ],
          "bounds": [
            1,
            14,
            30,
            18
          ],
          "opaque": 327,
          "origin": [
            16,
            31
          ],
          "semantic": "proneBlackHair",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                1,
                3
              ],
              [
                7,
                9
              ],
              [
                20,
                28
              ]
            ]
          }
        },
        {
          "column": 43,
          "row": 3,
          "rect": [
            1376,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 44,
          "row": 0,
          "rect": [
            1408,
            32,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            32,
            32
          ],
          "opaque": 575,
          "origin": [
            16,
            31
          ],
          "semantic": "longHairTransformFlareA",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                3,
                5
              ],
              [
                7,
                7
              ],
              [
                24,
                29
              ]
            ]
          }
        },
        {
          "column": 44,
          "row": 1,
          "rect": [
            1408,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            22,
            31
          ],
          "opaque": 360,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance0",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 44,
          "row": 2,
          "rect": [
            1408,
            96,
            32,
            32
          ],
          "bounds": [
            2,
            0,
            22,
            31
          ],
          "opaque": 360,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance0",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 44,
          "row": 3,
          "rect": [
            1408,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 45,
          "row": 0,
          "rect": [
            1440,
            32,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            32,
            32
          ],
          "opaque": 545,
          "origin": [
            16,
            31
          ],
          "semantic": "longHairTransformFlareB",
          "lowestOpaque": {
            "y": 31,
            "spans": [
              [
                2,
                13
              ],
              [
                16,
                20
              ],
              [
                22,
                24
              ],
              [
                26,
                28
              ]
            ]
          }
        },
        {
          "column": 45,
          "row": 1,
          "rect": [
            1440,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            21,
            31
          ],
          "opaque": 345,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance1",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                7,
                10
              ],
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 45,
          "row": 2,
          "rect": [
            1440,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            21,
            31
          ],
          "opaque": 345,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance1",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ],
              [
                21,
                24
              ]
            ]
          }
        },
        {
          "column": 45,
          "row": 3,
          "rect": [
            1440,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 46,
          "row": 0,
          "rect": [
            1472,
            32,
            32,
            32
          ],
          "bounds": [
            6,
            3,
            22,
            28
          ],
          "opaque": 422,
          "origin": [
            16,
            31
          ],
          "semantic": "longHairTransformSettled",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                14
              ],
              [
                18,
                22
              ]
            ]
          }
        },
        {
          "column": 46,
          "row": 1,
          "rect": [
            1472,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            15,
            31
          ],
          "opaque": 322,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance2",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                12
              ],
              [
                18,
                20
              ]
            ]
          }
        },
        {
          "column": 46,
          "row": 2,
          "rect": [
            1472,
            96,
            32,
            32
          ],
          "bounds": [
            9,
            0,
            15,
            31
          ],
          "opaque": 322,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance2",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                13
              ],
              [
                19,
                21
              ]
            ]
          }
        },
        {
          "column": 46,
          "row": 3,
          "rect": [
            1472,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 47,
          "row": 0,
          "rect": [
            1504,
            32,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            19,
            31
          ],
          "opaque": 368,
          "origin": [
            16,
            31
          ],
          "semantic": "revertGold",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                19,
                22
              ]
            ]
          }
        },
        {
          "column": 47,
          "row": 1,
          "rect": [
            1504,
            64,
            32,
            32
          ],
          "bounds": [
            4,
            0,
            19,
            31
          ],
          "opaque": 348,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance3",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                9,
                12
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 47,
          "row": 2,
          "rect": [
            1504,
            96,
            32,
            32
          ],
          "bounds": [
            9,
            0,
            19,
            31
          ],
          "opaque": 348,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance3",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                19,
                22
              ]
            ]
          }
        },
        {
          "column": 47,
          "row": 3,
          "rect": [
            1504,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 48,
          "row": 0,
          "rect": [
            1536,
            32,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            19,
            31
          ],
          "opaque": 378,
          "origin": [
            16,
            31
          ],
          "semantic": "revertFadingGold",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                19,
                22
              ]
            ]
          }
        },
        {
          "column": 48,
          "row": 1,
          "rect": [
            1536,
            64,
            32,
            32
          ],
          "bounds": [
            3,
            1,
            21,
            30
          ],
          "opaque": 335,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance4",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                7,
                10
              ],
              [
                20,
                23
              ]
            ]
          }
        },
        {
          "column": 48,
          "row": 2,
          "rect": [
            1536,
            96,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            21,
            30
          ],
          "opaque": 335,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance4",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                11
              ],
              [
                21,
                24
              ]
            ]
          }
        },
        {
          "column": 48,
          "row": 3,
          "rect": [
            1536,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 49,
          "row": 0,
          "rect": [
            1568,
            32,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            19,
            31
          ],
          "opaque": 378,
          "origin": [
            16,
            31
          ],
          "semantic": "revertEmergingBlack",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                19,
                22
              ]
            ]
          }
        },
        {
          "column": 49,
          "row": 1,
          "rect": [
            1568,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            1,
            15,
            30
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance5",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 49,
          "row": 2,
          "rect": [
            1568,
            96,
            32,
            32
          ],
          "bounds": [
            9,
            1,
            15,
            30
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance5",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ]
            ]
          }
        },
        {
          "column": 49,
          "row": 3,
          "rect": [
            1568,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 50,
          "row": 0,
          "rect": [
            1600,
            32,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            19,
            31
          ],
          "opaque": 382,
          "origin": [
            16,
            31
          ],
          "semantic": "revertBlack",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                19,
                22
              ]
            ]
          }
        },
        {
          "column": 50,
          "row": 1,
          "rect": [
            1600,
            64,
            32,
            32
          ],
          "bounds": [
            8,
            0,
            19,
            31
          ],
          "opaque": 309,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance6",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                16,
                19
              ]
            ]
          }
        },
        {
          "column": 50,
          "row": 2,
          "rect": [
            1600,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            0,
            19,
            31
          ],
          "opaque": 309,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance6",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                12,
                15
              ]
            ]
          }
        },
        {
          "column": 50,
          "row": 3,
          "rect": [
            1600,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 51,
          "row": 0,
          "rect": [
            1632,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 51,
          "row": 1,
          "rect": [
            1632,
            64,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            18,
            31
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance7",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                17,
                20
              ]
            ]
          }
        },
        {
          "column": 51,
          "row": 2,
          "rect": [
            1632,
            96,
            32,
            32
          ],
          "bounds": [
            7,
            0,
            18,
            31
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance7",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                11,
                14
              ]
            ]
          }
        },
        {
          "column": 51,
          "row": 3,
          "rect": [
            1632,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 52,
          "row": 0,
          "rect": [
            1664,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 52,
          "row": 1,
          "rect": [
            1664,
            64,
            32,
            32
          ],
          "bounds": [
            6,
            0,
            26,
            31
          ],
          "opaque": 360,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance8",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                19,
                23
              ]
            ]
          }
        },
        {
          "column": 52,
          "row": 2,
          "rect": [
            1664,
            96,
            32,
            32
          ],
          "bounds": [
            0,
            0,
            26,
            31
          ],
          "opaque": 360,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance8",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                8,
                12
              ]
            ]
          }
        },
        {
          "column": 52,
          "row": 3,
          "rect": [
            1664,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 53,
          "row": 0,
          "rect": [
            1696,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 53,
          "row": 1,
          "rect": [
            1696,
            64,
            32,
            32
          ],
          "bounds": [
            2,
            8,
            26,
            23
          ],
          "opaque": 311,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance9",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                23,
                27
              ]
            ]
          }
        },
        {
          "column": 53,
          "row": 2,
          "rect": [
            1696,
            96,
            32,
            32
          ],
          "bounds": [
            4,
            8,
            26,
            23
          ],
          "opaque": 311,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance9",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                4,
                8
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 53,
          "row": 3,
          "rect": [
            1696,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 54,
          "row": 0,
          "rect": [
            1728,
            32,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        },
        {
          "column": 54,
          "row": 1,
          "rect": [
            1728,
            64,
            32,
            32
          ],
          "bounds": [
            0,
            10,
            27,
            21
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance10",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                10,
                13
              ],
              [
                22,
                26
              ]
            ]
          }
        },
        {
          "column": 54,
          "row": 2,
          "rect": [
            1728,
            96,
            32,
            32
          ],
          "bounds": [
            5,
            10,
            27,
            21
          ],
          "opaque": 318,
          "origin": [
            16,
            31
          ],
          "semantic": "fusionDance10",
          "lowestOpaque": {
            "y": 30,
            "spans": [
              [
                5,
                9
              ],
              [
                18,
                21
              ]
            ]
          }
        },
        {
          "column": 54,
          "row": 3,
          "rect": [
            1728,
            128,
            32,
            32
          ],
          "bounds": null,
          "opaque": 0,
          "origin": [
            16,
            31
          ],
          "semantic": "empty"
        }
      ],
      "clips": {
        "idle": {
          "frames": [
            {
              "column": 0,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "notes": "Hold the open-eye cell. Blinking is a separate brief action, never a 50/50 two-frame idle loop."
        },
        "blink": {
          "frames": [
            {
              "column": 1,
              "ticks": 5
            }
          ],
          "loop": false,
          "validRows": [
            0,
            1,
            2
          ],
          "fallback": "idle",
          "notes": "The up-facing blink cell is empty in both sheets."
        },
        "walk": {
          "frames": [
            {
              "column": 2,
              "ticks": 6
            },
            {
              "column": 3,
              "ticks": 6
            },
            {
              "column": 4,
              "ticks": 6
            },
            {
              "column": 5,
              "ticks": 6
            }
          ],
          "loop": true
        },
        "run": {
          "frames": [
            {
              "column": 6,
              "ticks": 3
            },
            {
              "column": 7,
              "ticks": 3
            },
            {
              "column": 8,
              "ticks": 3
            },
            {
              "column": 9,
              "ticks": 3
            }
          ],
          "loop": true
        },
        "punch": {
          "frames": [
            {
              "column": 10,
              "ticks": 2
            },
            {
              "column": 11,
              "ticks": 2
            },
            {
              "column": 12,
              "ticks": 2
            },
            {
              "column": 13,
              "ticks": 3
            }
          ],
          "loop": false,
          "hitFrames": [
            1,
            2
          ],
          "comboSlot": 0
        },
        "cross": {
          "frames": [
            {
              "column": 10,
              "ticks": 3
            },
            {
              "column": 11,
              "ticks": 2
            },
            {
              "column": 12,
              "ticks": 2
            },
            {
              "column": 13,
              "ticks": 4
            }
          ],
          "loop": false,
          "hitFrames": [
            1,
            2
          ],
          "comboSlot": 1,
          "sourceGap": "SSJ has one four-frame punch strip. Cross deliberately reuses it with different timing; there is no second directional punch strip to select."
        },
        "kick": {
          "frames": [
            {
              "column": 14,
              "ticks": 3
            },
            {
              "column": 15,
              "ticks": 2
            },
            {
              "column": 16,
              "ticks": 2
            },
            {
              "column": 17,
              "ticks": 4
            }
          ],
          "loop": false,
          "hitFrames": [
            1,
            2
          ],
          "comboSlot": 2
        },
        "chargeWindup": {
          "frames": [
            {
              "column": 18,
              "ticks": 3
            }
          ],
          "loop": false
        },
        "charge": {
          "frames": [
            {
              "column": 18,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "notes": "Hold the cupped-hands preparation cell. 19/20 are release, not charging."
        },
        "beam": {
          "frames": [
            {
              "column": 19,
              "ticks": 3
            },
            {
              "column": 20,
              "ticks": 5
            },
            {
              "column": 21,
              "ticks": 4
            }
          ],
          "loop": false,
          "emitFrames": [
            0
          ],
          "notes": "Two extended-palm release poses followed by the guard recovery."
        },
        "beamHold": {
          "frames": [
            {
              "column": 19,
              "ticks": 3
            },
            {
              "column": 20,
              "ticks": 3
            }
          ],
          "loop": true
        },
        "beamRecovery": {
          "frames": [
            {
              "column": 21,
              "ticks": 4
            }
          ],
          "loop": false
        },
        "blast": {
          "frames": [
            {
              "column": 24,
              "ticks": 2
            },
            {
              "column": 25,
              "ticks": 2
            },
            {
              "column": 26,
              "ticks": 2
            },
            {
              "column": 27,
              "ticks": 3
            }
          ],
          "loop": false,
          "emitFrames": [
            1,
            2
          ]
        },
        "guard": {
          "frames": [
            {
              "column": 21,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true
        },
        "hurt": {
          "frames": [
            {
              "column": 28,
              "ticks": 5
            },
            {
              "column": 30,
              "ticks": 5
            }
          ],
          "loop": false
        },
        "airKnockback": {
          "frames": [
            {
              "column": 28,
              "ticks": 3
            },
            {
              "column": 29,
              "ticks": 8
            },
            {
              "column": 30,
              "ticks": 5
            }
          ],
          "loop": false
        },
        "brace": {
          "frames": [
            {
              "column": 30,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true
        },
        "jump": {
          "frames": [
            {
              "column": 33,
              "ticks": 4
            },
            {
              "column": 34,
              "ticks": 4
            },
            {
              "column": 35,
              "ticks": 5
            }
          ],
          "loop": false
        },
        "land": {
          "frames": [
            {
              "column": 35,
              "ticks": 2
            },
            {
              "column": 34,
              "ticks": 3
            },
            {
              "column": 33,
              "ticks": 4
            },
            {
              "column": 32,
              "ticks": 3
            }
          ],
          "loop": false,
          "adaptation": true
        },
        "fall": {
          "frames": [
            {
              "column": 40,
              "ticks": 3
            },
            {
              "column": 41,
              "ticks": 6
            },
            {
              "column": 42,
              "ticks": 5
            },
            {
              "column": 43,
              "ticks": 10
            }
          ],
          "loop": false,
          "rowByFacing": {
            "down": 1,
            "right": 2,
            "left": 1,
            "up": 1
          },
          "sourceGap": "Only left/right source poses. Down/up intentionally use left-facing art; retaining the last horizontal direction is another valid adapter choice.",
          "holdLast": true,
          "endsVisibleForm": "goku",
          "notes": "Source art loses the gold hair on impact and settles with black hair, supporting a reversion-on-defeat interpretation."
        },
        "dead": {
          "frames": [
            {
              "column": 43,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "rowByFacing": {
            "down": 1,
            "right": 2,
            "left": 1,
            "up": 1
          },
          "sourceGap": "Only left/right source poses. Down/up intentionally use left-facing art; retaining the last horizontal direction is another valid adapter choice.",
          "visibleForm": "goku"
        },
        "sleep": {
          "frames": [
            {
              "column": 43,
              "ticks": 1
            }
          ],
          "loop": false,
          "holdLast": true,
          "rowByFacing": {
            "down": 1,
            "right": 2,
            "left": 1,
            "up": 1
          },
          "sourceGap": "Only left/right source poses. Down/up intentionally use left-facing art; retaining the last horizontal direction is another valid adapter choice.",
          "visibleForm": "goku",
          "adaptation": true
        },
        "celebrate": {
          "frames": [
            {
              "column": 31,
              "ticks": 24
            },
            {
              "column": 32,
              "ticks": 6
            }
          ],
          "loop": false
        },
        "flight": {
          "frames": [
            {
              "column": 36,
              "ticks": 5
            },
            {
              "column": 37,
              "ticks": 5
            },
            {
              "column": 38,
              "ticks": 5
            },
            {
              "column": 39,
              "ticks": 5
            }
          ],
          "loop": true,
          "origin": [
            16,
            16
          ]
        },
        "flightDiagonal": {
          "frames": [],
          "available": false,
          "fallback": "flight",
          "sourceGap": "No SSJ diagonal flight strip is present. Quantize to a cardinal facing rather than sampling columns40–43."
        },
        "transform": {
          "frames": [
            {
              "column": 54,
              "ticks": 6,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 55,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 56,
              "ticks": 5,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 57,
              "ticks": 5,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 56,
              "ticks": 4,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 57,
              "ticks": 4,
              "sheet": "goku",
              "row": 0
            },
            {
              "column": 58,
              "ticks": 8,
              "sheet": "goku",
              "row": 0
            }
          ],
          "loop": false,
          "visibleFormChangeFrame": 2,
          "endsForm": "ssj"
        },
        "revert": {
          "frames": [
            {
              "column": 47,
              "ticks": 5,
              "sheet": "ssj",
              "row": 0
            },
            {
              "column": 48,
              "ticks": 5,
              "sheet": "ssj",
              "row": 0
            },
            {
              "column": 49,
              "ticks": 5,
              "sheet": "ssj",
              "row": 0
            },
            {
              "column": 50,
              "ticks": 8,
              "sheet": "ssj",
              "row": 0
            }
          ],
          "loop": false,
          "endsForm": "goku"
        },
        "push": {
          "frames": [
            {
              "column": 19,
              "ticks": 7
            },
            {
              "column": 20,
              "ticks": 7
            }
          ],
          "loop": true,
          "adaptation": true,
          "notes": "Extended palms reused as a shove. No dedicated pushing strip exists."
        },
        "swordLift": {
          "frames": [
            {
              "column": 41,
              "ticks": 24,
              "sheet": "ssj",
              "row": 0
            }
          ],
          "loop": false,
          "holdLast": true,
          "adaptation": true
        },
        "swordPull": {
          "frames": [
            {
              "column": 18,
              "ticks": 7
            },
            {
              "column": 30,
              "ticks": 7
            }
          ],
          "loop": true,
          "adaptation": true
        },
        "kneel": {
          "frames": [
            {
              "column": 33,
              "ticks": 1,
              "sheet": "ssj",
              "row": 0
            }
          ],
          "loop": false,
          "holdLast": true,
          "adaptation": true,
          "sourceGap": "No front kneeling/exercise strip equivalent to normal50–53. Uses the existing crouch pose."
        },
        "teleport": {
          "frames": [
            {
              "column": 22,
              "ticks": 3
            },
            {
              "column": 23,
              "ticks": 3
            }
          ],
          "loop": false
        }
      },
      "sockets": {
        "18": [
          [
            13,
            21
          ],
          [
            24,
            22
          ],
          [
            7,
            21
          ],
          [
            23,
            23
          ]
        ],
        "19": [
          [
            16,
            23
          ],
          [
            4,
            17
          ],
          [
            27,
            17
          ],
          [
            16,
            6
          ]
        ],
        "20": [
          [
            16,
            23
          ],
          [
            4,
            16
          ],
          [
            27,
            16
          ],
          [
            16,
            6
          ]
        ],
        "25": [
          [
            19,
            28
          ],
          [
            1,
            15
          ],
          [
            30,
            15
          ],
          [
            21,
            1
          ]
        ],
        "26": [
          [
            13,
            27
          ],
          [
            3,
            16
          ],
          [
            28,
            16
          ],
          [
            10,
            1
          ]
        ]
      }
    }
  }
};
// The supplied SSJ sheet omits the lead-hand jab. Compose sixteen fixed cells
// from the original jab bodies and SSJ's directional standing heads. These
// audited row masks remove only the old head, keeping fists and motion arcs.
// Entries use column * 4 + physical row: [dx,dy,opaque,bounds,head row bits].
const jabHeads = [
  [1,0,336,[10,0,18,31],[0x3c000,0x78f80,0x7bf00,0x3ffe00,0x7ffc00,0xffff80,0xffffe0,0xfb7ff0,0x1fbbf80,0x3fffe00,0xfffffc0,0xedff00,0x3f6fc00,0xfffe00,0x3ff000,0x4f8000,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [5,1,354,[12,1,20,31],[0x0,0x3e000,0x27c000,0x6fbf00,0x7ffc00,0xfff800,0x1fff000,0x3ffe000,0x3fff800,0x3fffe00,0xfffc000,0x7ff8000,0x7fb8000,0xfdc000,0x7f8000,0x3f0000,0xe0000,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [-5,1,354,[0,1,20,31],[0x0,0x7c000,0x3e400,0xfdf600,0x3ffe00,0x1fff00,0xfff80,0x7ffc0,0x1fffc0,0x7fffc0,0x3fff0,0x1ffe0,0x1dfe0,0x3bf00,0x1fe00,0xfc00,0x7000,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [5,0,368,[7,0,21,32],[0x0,0x1e0000,0xf8f0000,0x7ef0000,0x3ffe000,0x1fff000,0x7fff800,0x1ffff800,0x3ffff800,0x7fff800,0x3fffe00,0xfffff80,0x3fff800,0x1fffc00,0x3ffff00,0x7fe000,0x3f8000,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [0,3,362,[9,3,21,29],[0x0,0x8100,0x18300,0x18700,0x3cf00,0x3df00,0x1fff10,0x3ffe70,0x7fffe0,0x7fffe0,0x7fffc0,0xfffff80,0x3ffffe0,0xffffc0,0x7ffff00,0x1fbbf80,0xfd7f80,0x3fff00,0x7c000,0x0,0x0,0x0,0x0,0x0]],
  [2,1,326,[6,1,20,28],[0x1f8000,0x3dc00,0x31ee00,0x1bfe00,0x1ffe00,0x1ffc00,0x3ffd00,0x7fff00,0x7ffe00,0xfffc00,0xffff800,0x3fff000,0x7f7000,0x1ffb800,0x7ff000,0x7fe000,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [-2,1,326,[6,1,20,28],[0x1f800,0x3bc000,0x778c00,0x7fd800,0x7ff800,0x3ff800,0xbffc00,0xfffe00,0x7ffe00,0x3fff00,0x1ffff0,0xfffc0,0xefe00,0x1dff80,0xffe00,0x7fe00,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [0,0,400,[4,0,21,32],[0x0,0x1e0000,0x3ef8000,0xffff000,0xfff800,0x3fffc00,0xffffc00,0x1ffffc00,0x1ffffe00,0x21fffe00,0x3ffff00,0x7ffff80,0x8ffffc0,0x1fffe20,0x3fff00,0x7c180,0x40,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [0,4,356,[8,4,21,28],[0x0,0x0,0x0,0x0,0x1e000,0x3c7c0,0x3df80,0x1fff00,0x3ffe00,0x7fffc0,0x7ffff0,0x7ffff8,0xffffc0,0x3ffff00,0xfffffe0,0xffff80,0x1fede00,0x7fdbf00,0x3ff800,0x7c000,0x0,0x0,0x0,0x0]],
  [-1,2,373,[0,2,26,29],[0x0,0x0,0x0,0xc7c0,0x1bf00,0x1fff0,0x3fffe,0x7fff0,0xfffc0,0xfff00,0xcffb80,0x7fffe0,0x3ffef0,0xffee00,0x3ff700,0xffe00,0x33c00,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [1,2,373,[6,2,26,29],[0x0,0x0,0x0,0x3e30000,0xfd8000,0xfff8000,0x7fffc000,0xfffe000,0x3fff000,0xfff000,0x1dff300,0x7fffe00,0xf7ffc00,0x77ff00,0xeffc00,0x7ff000,0x3cc000,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [0,0,379,[5,0,20,32],[0x61e0000,0x78f0000,0x3ef0000,0x3ffe000,0x1fff000,0x7ffff800,0x3ffff800,0x1ffff800,0x7ffffc0,0x3ffff00,0x1ffffc00,0x7ffff80,0x1ffff00,0x3fffc00,0x7ff000,0x7e000,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [0,3,328,[6,3,23,29],[0x0,0x0,0x0,0x1e000,0x3c7c0,0x3df80,0x1fff00,0x3ffe00,0x7fffc0,0x7ffff0,0x7ffff8,0xffffc0,0x3ffff00,0xfffffe0,0xffff80,0x1fbbe00,0x7fd7f00,0x3ff800,0x7c000,0x0,0x0,0x0,0x0,0x0]],
  [1,0,347,[3,0,23,31],[0x0,0x1f00,0x13e00,0x37df8,0x3ffe0,0x7ffc0,0xfff80,0x1fff00,0x1fffc0,0x1ffff0,0x7ffe00,0x3fffc00,0xffdc00,0x3fee00,0x7ffc00,0xfe3800,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [-1,0,347,[6,0,23,31],[0x0,0xf80000,0x7c8000,0x1fbec000,0x7ffc000,0x3ffe000,0x1fff000,0xfff800,0x3fff800,0xffff800,0x7ffe00,0x3fffc0,0x3bff00,0x77fc00,0x3ffe00,0x1c7f00,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]],
  [1,0,373,[7,0,22,32],[0x0,0x1e0000,0xf8f0000,0x7ef0000,0x3ffe000,0x1fff000,0xffff800,0x3ffff800,0x7ffff800,0xffffc00,0x3ffff00,0x1fffffc0,0x7fffc00,0x1fffe00,0x3ffff80,0x780000,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]]
];
data.forms.ssjJab = {sheet:'ssjJab',source:'goku:10-13 body + ssj:0 head',width:128,height:160,columns:4,
  cells:jabHeads.map(([dx,dy,opaque,bounds,mask],i)=>({column:i>>2,row:i%4,rect:[(i>>2)*32,32+(i%4)*32,32,32],
    bounds,opaque,origin:[16,31],semantic:'punch',bodyColumn:10+(i>>2),head:{offset:[dx,dy],mask}}))};
data.forms.ssj.clips.punch.frames.forEach((f,i)=>{f.sheet='ssjJab';f.column=i;});
data.forms.ssj.clips.cross.sourceGap='The original SSJ punch supplies the rear-hand cross. The lead-hand jab uses the matching base-form body with the existing golden head.';
// The boy's push rhythm: hold a straight-armed press, ease into a heave
// with the head bowed toward the object, hold it, ease back.
for(const sheet of ['goku','ssj'])data.forms[sheet].clips.nudge={
  frames:[{column:0,nudge:0,ticks:16},{column:0,nudge:1,ticks:5},
    {column:0,nudge:2,ticks:16},{column:0,nudge:3,ticks:5}],loop:true,adaptation:true,
};
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
root.GokuAnimationData = freeze(data);
})(typeof window !== 'undefined' ? window : globalThis);

// Native ROM pixel coordinates. Potos is map131; browser story and dynamic actors are authored here.
// Extracted solidity is used for maps with romId. Room polygons cover cropped ROM interiors.
export const WIDTH = 480;

export const HEIGHT = 270;

export const SAVE_VERSION = 1;

export const SAVE_KEY = "secret-of-goku.potos.v1";

export const ASSETS = {
  "potos": "assets/maps/rom-potos-composite.png",
  "cave": "assets/maps/rom-mantis-cave-composite.png",
  "interiors": "assets/maps/rom-houses-composite.png",
  "world": "assets/maps/rom-world.png",
  "goku": "assets/sprites/goku.png",
  "ssj": "assets/sprites/ssj.png",
  "npcs": "assets/sprites/npcs.png",
  "characters": "assets/sprites/characters.png",
  "rabite": "assets/sprites/rabite.png",
  "mantis": "assets/sprites/mantis.png"
};

export const MAPS = {
  "potos": {
    "name": "Potos Village",
    "subtitle": "A quiet village. For now.",
    "asset": "potos",
    "width": 832,
    "height": 832,
    "spawn": {
      "x": 134,
      "y": 356
    },
    "outdoor": true,
    "floor": [
      [
        -48,
        336
      ],
      [
        100,
        336
      ],
      [
        136,
        304
      ],
      [
        159,
        252
      ],
      [
        196,
        227
      ],
      [
        202,
        197
      ],
      [
        368,
        197
      ],
      [
        397,
        267
      ],
      [
        454,
        267
      ],
      [
        503,
        202
      ],
      [
        514,
        177
      ],
      [
        640,
        177
      ],
      [
        647,
        310
      ],
      [
        627,
        366
      ],
      [
        632,
        452
      ],
      [
        588,
        513
      ],
      [
        564,
        581
      ],
      [
        592,
        628
      ],
      [
        577,
        707
      ],
      [
        582,
        799
      ],
      [
        575,
        832
      ],
      [
        467,
        832
      ],
      [
        493,
        729
      ],
      [
        489,
        704
      ],
      [
        463,
        690
      ],
      [
        399,
        697
      ],
      [
        281,
        692
      ],
      [
        187,
        689
      ],
      [
        159,
        660
      ],
      [
        143,
        609
      ],
      [
        125,
        581
      ],
      [
        116,
        530
      ],
      [
        125,
        479
      ],
      [
        109,
        407
      ],
      [
        98,
        382
      ],
      [
        -48,
        382
      ]
    ],
    "solids": [
      [
        202,
        274,
        103,
        47
      ],
      [
        336,
        351,
        144,
        48
      ],
      [
        160,
        433,
        96,
        63
      ],
      [
        176,
        580,
        142,
        45
      ],
      [
        176,
        625,
        65,
        30
      ],
      [
        529,
        224,
        110,
        49
      ],
      [
        503,
        314,
        67,
        14
      ],
      [
        602,
        314,
        38,
        14
      ],
      [
        373,
        570,
        28,
        27
      ],
      [
        261,
        467,
        18,
        22
      ],
      [
        305,
        467,
        19,
        22
      ],
      [
        287,
        470,
        18,
        24
      ]
    ],
    "occluders": [
      {
        "rect": [
          200,
          208,
          120,
          114
        ],
        "y": 321
      },
      {
        "rect": [
          328,
          288,
          152,
          112
        ],
        "y": 399
      },
      {
        "rect": [
          160,
          375,
          96,
          121
        ],
        "y": 496
      },
      {
        "rect": [
          175,
          528,
          145,
          127
        ],
        "y": 653
      },
      {
        "rect": [
          518,
          174,
          123,
          100
        ],
        "y": 273
      },
      {
        "rect": [
          328,
          487,
          103,
          113
        ],
        "y": 590
      },
      {
        "rect": [
          256,
          431,
          28,
          65
        ],
        "y": 487
      },
      {
        "rect": [
          303,
          431,
          29,
          65
        ],
        "y": 487
      }
    ],
    "doors": [
      {
        "x": 296,
        "y": 625,
        "to": "inn",
        "name": "Potos Inn",
        "spawn": [
          112,
          194
        ]
      },
      {
        "x": 216,
        "y": 496,
        "to": "shop",
        "name": "Village shop",
        "spawn": [
          64,
          186
        ]
      },
      {
        "x": 263,
        "y": 322,
        "to": "home",
        "name": "Village home",
        "spawn": [
          144,
          170
        ]
      },
      {
        "x": 439,
        "y": 400,
        "to": "store",
        "name": "Storehouse",
        "spawn": [
          64,
          169
        ]
      },
      {
        "x": 583,
        "y": 274,
        "to": "elder",
        "name": "Elder's house",
        "spawn": [
          128,
          170
        ]
      }
    ],
    "romId": 131
  },
  "inn": {
    "name": "Potos Inn",
    "subtitle": "The all-you-can-eat incident",
    "asset": "interiors",
    "crop": [
      80,
      384,
      288,
      224
    ],
    "width": 288,
    "height": 224,
    "floor": [
      [
        24,
        87
      ],
      [
        126,
        87
      ],
      [
        126,
        113
      ],
      [
        266,
        113
      ],
      [
        266,
        207
      ],
      [
        128,
        207
      ],
      [
        128,
        223
      ],
      [
        91,
        223
      ],
      [
        91,
        207
      ],
      [
        24,
        207
      ]
    ],
    "solids": [
      [
        29,
        112,
        58,
        45
      ],
      [
        139,
        109,
        128,
        25
      ]
    ],
    "exit": {
      "x": 112,
      "y": 214,
      "to": [
        296,
        641
      ]
    }
  },
  "shop": {
    "name": "Village Shop",
    "subtitle": "No sword. No problem.",
    "asset": "interiors",
    "crop": [
      416,
      96,
      160,
      208
    ],
    "width": 160,
    "height": 208,
    "floor": [
      [
        17,
        77
      ],
      [
        144,
        77
      ],
      [
        144,
        191
      ],
      [
        89,
        191
      ],
      [
        89,
        207
      ],
      [
        53,
        207
      ],
      [
        53,
        191
      ],
      [
        17,
        191
      ]
    ],
    "solids": [
      [
        20,
        78,
        123,
        60
      ]
    ],
    "exit": {
      "x": 72,
      "y": 199,
      "to": [
        216,
        509
      ]
    }
  },
  "home": {
    "name": "A Village Home",
    "subtitle": "Somebody has already eaten the porridge.",
    "asset": "interiors",
    "crop": [
      80,
      80,
      240,
      192
    ],
    "width": 240,
    "height": 192,
    "floor": [
      [
        18,
        89
      ],
      [
        90,
        89
      ],
      [
        90,
        64
      ],
      [
        224,
        64
      ],
      [
        224,
        175
      ],
      [
        176,
        175
      ],
      [
        176,
        191
      ],
      [
        136,
        191
      ],
      [
        136,
        175
      ],
      [
        18,
        175
      ]
    ],
    "solids": [
      [
        17,
        114,
        80,
        58
      ],
      [
        127,
        84,
        67,
        44
      ]
    ],
    "exit": {
      "x": 156,
      "y": 183,
      "to": [
        263,
        337
      ]
    }
  },
  "elder": {
    "name": "Elder's House",
    "subtitle": "A prophecy meets a scheduling problem.",
    "asset": "interiors",
    "crop": [
      704,
      80,
      240,
      192
    ],
    "width": 240,
    "height": 192,
    "floor": [
      [
        17,
        87
      ],
      [
        81,
        87
      ],
      [
        81,
        64
      ],
      [
        216,
        64
      ],
      [
        216,
        175
      ],
      [
        150,
        175
      ],
      [
        150,
        191
      ],
      [
        109,
        191
      ],
      [
        109,
        175
      ],
      [
        17,
        175
      ]
    ],
    "solids": [
      [
        34,
        117,
        58,
        39
      ],
      [
        174,
        50,
        52,
        54
      ]
    ],
    "exit": {
      "x": 130,
      "y": 182,
      "to": [
        583,
        287
      ]
    }
  },
  "store": {
    "name": "Village Storehouse",
    "subtitle": "One very important bean.",
    "asset": "interiors",
    "crop": [
      720,
      400,
      144,
      192
    ],
    "width": 144,
    "height": 192,
    "floor": [
      [
        17,
        101
      ],
      [
        58,
        101
      ],
      [
        58,
        65
      ],
      [
        127,
        65
      ],
      [
        127,
        178
      ],
      [
        17,
        178
      ]
    ],
    "solids": [
      [
        18,
        105,
        20,
        38
      ],
      [
        111,
        67,
        16,
        79
      ]
    ],
    "exit": {
      "x": 67,
      "y": 177,
      "to": [
        439,
        415
      ]
    }
  },
  "cave": {
    "name": "Potos Cave",
    "subtitle": "The first boss. Technically.",
    "asset": "cave",
    "width": 416,
    "height": 352,
    "floor": [
      [
        113,
        91
      ],
      [
        154,
        111
      ],
      [
        199,
        112
      ],
      [
        254,
        94
      ],
      [
        312,
        96
      ],
      [
        336,
        137
      ],
      [
        345,
        174
      ],
      [
        301,
        182
      ],
      [
        266,
        215
      ],
      [
        282,
        240
      ],
      [
        267,
        275
      ],
      [
        225,
        293
      ],
      [
        202,
        329
      ],
      [
        162,
        319
      ],
      [
        122,
        328
      ],
      [
        93,
        307
      ],
      [
        80,
        284
      ],
      [
        99,
        239
      ],
      [
        82,
        222
      ],
      [
        78,
        189
      ],
      [
        106,
        179
      ],
      [
        105,
        142
      ]
    ],
    "solids": [],
    "exit": {
      "x": 117,
      "y": 290,
      "to": [
        488,
        495
      ]
    },
    "romId": 260,
    "crop": [
      0,
      16,
      416,
      352
    ],
    "collisionOrigin": [
      0,
      16
    ]
  }
};

export const NPCS = [
  {
    "id": "elder",
    "name": "Elder",
    "map": "potos",
    "x": 584,
    "y": 289,
    "sheet": "npcs",
    "rect": [
      640,
      589,
      23,
      30
    ],
    "marker": true
  },
  {
    "id": "jema",
    "name": "Jema",
    "map": "potos",
    "x": 535,
    "y": 420,
    "sheet": "characters",
    "rect": [
      12,
      305,
      26,
      34
    ]
  },
  {
    "id": "elliot",
    "name": "Elliot",
    "map": "potos",
    "x": 175,
    "y": 362,
    "sheet": "characters",
    "rect": [
      429,
      160,
      24,
      34
    ]
  },
  {
    "id": "timothy",
    "name": "Timothy",
    "map": "potos",
    "x": 185,
    "y": 515,
    "sheet": "characters",
    "rect": [
      432,
      257,
      24,
      33
    ]
  },
  {
    "id": "gardener",
    "name": "Gardener",
    "map": "potos",
    "x": 342,
    "y": 458,
    "sheet": "npcs",
    "rect": [
      301,
      195,
      28,
      40
    ]
  },
  {
    "id": "guard",
    "name": "Gatekeeper",
    "map": "potos",
    "x": 554,
    "y": 627,
    "sheet": "npcs",
    "rect": [
      637,
      774,
      25,
      39
    ]
  },
  {
    "id": "innkeeper",
    "name": "Innkeeper",
    "map": "inn",
    "x": 245,
    "y": 105,
    "sheet": "npcs",
    "rect": [
      636,
      200,
      25,
      36
    ]
  },
  {
    "id": "shopkeeper",
    "name": "Shopkeeper",
    "map": "shop",
    "x": 78,
    "y": 85,
    "sheet": "npcs",
    "rect": [
      636,
      200,
      25,
      36
    ]
  },
  {
    "id": "resident",
    "name": "Villager",
    "map": "home",
    "x": 110,
    "y": 135,
    "sheet": "npcs",
    "rect": [
      506,
      389,
      25,
      36
    ]
  },
  {
    "id": "elderInside",
    "name": "Elder",
    "map": "elder",
    "x": 146,
    "y": 113,
    "sheet": "npcs",
    "rect": [
      640,
      589,
      23,
      30
    ],
    "marker": true
  }
];

export const OBSTACLES = [
  {
    "id": "gate",
    "kind": "gate",
    "name": "Village gate",
    "x": 535,
    "y": 672,
    "radius": 22,
    "hp": 600,
    "rect": [
      513,
      657,
      45,
      27
    ],
    "breakTitle": "NO EXIT PERMIT REQUIRED",
    "breakText": "Punched through the village gate before being banished."
  },
  {
    "id": "boulder",
    "kind": "rock",
    "name": "Ancient seal",
    "x": 519,
    "y": 350,
    "radius": 17,
    "hp": 1800,
    "rect": [
      502,
      336,
      34,
      27
    ],
    "breakTitle": "ANCIENT SEAL, MODERN SOLUTION",
    "breakText": "Skipped the ancient-seal quest with a very ordinary punch."
  },
  {
    "id": "log",
    "kind": "log",
    "name": "Fallen log",
    "x": 285,
    "y": 426,
    "radius": 19,
    "hp": 500,
    "rect": [
      263,
      416,
      44,
      19
    ],
    "breakTitle": "AXE NOT REQUIRED",
    "breakText": "Cleared the fallen log without finding the axe."
  }
];

export const RABITES = [
  {
    "id": "rabite1",
    "x": 236,
    "y": 354
  },
  {
    "id": "rabite2",
    "x": 305,
    "y": 454
  },
  {
    "id": "rabite3",
    "x": 491,
    "y": 493
  },
  {
    "id": "rabite4",
    "x": 411,
    "y": 637
  },
  {
    "id": "rabite5",
    "x": 507,
    "y": 580
  }
];

export const TECHNIQUES = [
  {
    "id": "super",
    "name": "Super Saiyan",
    "caption": "A completely unfair transformation.",
    "cost": "TOGGLE",
    "icon": "star",
    "key": "1"
  },
  {
    "id": "wave",
    "name": "Kamehameha",
    "caption": "A full-power wave. Mind the landscaping.",
    "cost": "30 KI",
    "icon": "wave",
    "key": "2"
  },
  {
    "id": "volley",
    "name": "Ki barrage",
    "caption": "Three blasts. Even fewer problems.",
    "cost": "18 KI",
    "icon": "blast",
    "key": "3"
  },
  {
    "id": "spirit",
    "name": "Spirit Bomb",
    "caption": "The village lends you its energy. Briefly.",
    "cost": "60 KI",
    "icon": "orb",
    "key": "4"
  },
  {
    "id": "flight",
    "name": "Flight",
    "caption": "Flammie can have the day off.",
    "cost": "FREE",
    "icon": "flight",
    "key": "5"
  },
  {
    "id": "senzu",
    "name": "Senzu bean",
    "caption": "A whole adventure in one small lunch.",
    "cost": "1 BEAN",
    "icon": "bean",
    "key": "6"
  }
];

export const LANDINGS = [
  {
    "name": "West entrance",
    "x": 134,
    "y": 357
  },
  {
    "name": "Elder's terrace",
    "x": 579,
    "y": 296
  },
  {
    "name": "Beyond the south gate",
    "x": 534,
    "y": 758
  }
];

export const POTOS_WORLD = {
  "x": 608,
  "y": 756
};

export const CREDITS = [
  [
    "Secret of Mana maps & sprites",
    "Square • maps decoded from the supplied US ROM; NPC/enemy sheets by Davias and Thanwe. Reference maps credited in CREDITS.md."
  ],
  [
    "Goku & Super Saiyan sprites",
    "Dragon Ball Z: Buu's Fury • Webfoot / Atari • sheet by SpYn_ (original listing: Mister Man)"
  ],
  [
    "Browser conversion",
    "New game logic, dialogue, effects and synthesized audio. Source links in CREDITS.md."
  ]
];

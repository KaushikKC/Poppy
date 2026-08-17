/**
 * The companion cast, generated from backend/characters.py.
 *
 * Generated rather than retyped: the colour values and taglines are content, and
 * a typo here would surface as a wrong-looking avatar rather than an error. To
 * update, change the Python and re-run scripts/gen_characters.py.
 */

export type CharacterColor = {
  face: string;
  gradient: string;
  eyes: string;
  outline: string;
  glow: string;
};

export type Character = {
  key: string;
  name: string;
  gender: string;
  tagline: string;
  color: CharacterColor;
  photo: string;
};

/** Exactly what GET /characters returns (backend/characters.py ui_list()). */
export const CAST: Character[] = [
  {
    "key": "poppy",
    "name": "Poppy",
    "gender": "female",
    "tagline": "warm and easy to talk to",
    "color": {
      "face": "#18112e",
      "gradient": "#2d2248",
      "eyes": "#9b8ff5",
      "outline": "#7c6ef0",
      "glow": "124,110,240"
    },
    "photo": "avatar/characters/poppy.jpg"
  },
  {
    "key": "luna",
    "name": "Luna",
    "gender": "female",
    "tagline": "calm and grounding",
    "color": {
      "face": "#0d1f2d",
      "gradient": "#1a3a4a",
      "eyes": "#4fc3f7",
      "outline": "#0288d1",
      "glow": "2,136,209"
    },
    "photo": "avatar/characters/luna.jpg"
  },
  {
    "key": "zoe",
    "name": "Zoe",
    "gender": "female",
    "tagline": "playful and full of energy",
    "color": {
      "face": "#2d0a1a",
      "gradient": "#4a1a2a",
      "eyes": "#f48fb1",
      "outline": "#e91e63",
      "glow": "233,30,99"
    },
    "photo": "avatar/characters/zoe.jpg"
  },
  {
    "key": "leo",
    "name": "Leo",
    "gender": "male",
    "tagline": "easygoing and funny",
    "color": {
      "face": "#12210f",
      "gradient": "#24401d",
      "eyes": "#8bd97a",
      "outline": "#4caf50",
      "glow": "76,175,80"
    },
    "photo": "avatar/characters/leo.jpg"
  },
  {
    "key": "kai",
    "name": "Kai",
    "gender": "male",
    "tagline": "your hype and motivation",
    "color": {
      "face": "#2e1a08",
      "gradient": "#4a2c11",
      "eyes": "#ffb74d",
      "outline": "#f57c00",
      "glow": "245,124,0"
    },
    "photo": "avatar/characters/kai.jpg"
  },
  {
    "key": "ravi",
    "name": "Ravi",
    "gender": "male",
    "tagline": "thoughtful and grounded",
    "color": {
      "face": "#0d2626",
      "gradient": "#164545",
      "eyes": "#4dd0c4",
      "outline": "#009688",
      "glow": "0,150,136"
    },
    "photo": "avatar/characters/ravi.jpg"
  }
];

/** Voice + gender per character, for the profile written at onboarding. */
export const TRAITS: Record<string, { voice: string; gender: string; name: string }> =
  {
  "poppy": {
    "voice": "af_heart",
    "gender": "female",
    "name": "Poppy"
  },
  "luna": {
    "voice": "af_nicole",
    "gender": "female",
    "name": "Luna"
  },
  "zoe": {
    "voice": "af_bella",
    "gender": "female",
    "name": "Zoe"
  },
  "leo": {
    "voice": "am_adam",
    "gender": "male",
    "name": "Leo"
  },
  "kai": {
    "voice": "am_fenrir",
    "gender": "male",
    "name": "Kai"
  },
  "ravi": {
    "voice": "am_michael",
    "gender": "male",
    "name": "Ravi"
  }
};

export function traitsFor(key: string) {
  return TRAITS[key] ?? TRAITS.poppy;
}

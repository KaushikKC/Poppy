/**
 * Facts the page, the metadata and the structured data all state. One copy, so the
 * visible page and what search engines and AI agents read can never disagree.
 */

export const SITE_URL = "https://www.poppys.social";
export const CONTACT = "poppysdotsocial@gmail.com";

// The public TestFlight invite. iPhone is the only platform with an open beta.
export const TESTFLIGHT = "https://testflight.apple.com/join/6cHu33a3";

// Plain questions, plain answers. Rendered on the page and mirrored in JSON-LD (layout.tsx)
// so people, search engines and AI agents all read the same facts.
export const FAQ: { q: string; a: string }[] = [
  {
    q: "What is Poppys?",
    a: "Poppys is an AI companion app. You pick one of six characters, text or send voice notes, and she replies in her own voice. She remembers what matters to you, with your consent.",
  },
  {
    q: "Does my conversation leave my phone?",
    a: "No. Speech recognition, the language model, her voice and her memory all run on your phone. The app downloads its models once, then works offline.",
  },
  {
    q: "How do I get it?",
    a: "Poppys is in public beta on iPhone through Apple TestFlight. Install TestFlight, open the invite link on this page, and tap Accept. Android is in closed testing.",
  },
  {
    q: "Is it free?",
    a: "Yes. The beta is free, with no account required.",
  },
  {
    q: "Is Poppys a therapist?",
    a: "No. Poppys is a companion, not a medical or mental health service. If someone is in crisis, the app recognises it on-device and shows local helplines.",
  },
  {
    q: "What is the Poppys device?",
    a: "A small, always-on hardware companion we are designing: a screen, a speaker and the same on-device model, with no phone needed. It is a concept today, not a product for sale.",
  },
];

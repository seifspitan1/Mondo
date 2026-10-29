/**
 * MONDO Browser-Safe Client Defaults
 * Dedicated frontend data module providing fallback project and settings records.
 * Synchronized with lib/defaults.js with automated equality testing to prevent drift.
 */

export const defaultProjects = [
  {
    id: 'concept-orchard',
    slug: 'rainbow-orchard',
    title: 'Rainbow Orchard',
    category: 'Thumbnails',
    image: '/assets/rainbow-orchard.webp',
    video: '',
    description: 'A little discovery. A very big reason to play. A colorful orchard concept built around an impossible rainbow apple.',
    objective: 'Make the reward instantly understandable, even at thumbnail size.',
    hook: 'One extraordinary fruit turns a familiar orchard into a discovery worth chasing.',
    role: 'Creative direction · Thumbnail concept',
    published: true,
    featured: true,
    concept: true,
    order: 0
  },
  {
    id: 'concept-cat',
    slug: 'cat-battle',
    title: 'Cat Battles',
    category: 'Thumbnails',
    image: '/assets/cat-battle.webp',
    video: '',
    description: 'Big personalities, one decisive moment. A playful arena concept that puts the action front and center.',
    objective: 'Show the competitive game loop through a single readable action.',
    hook: 'A dramatic throw and a clear reaction make the story easy to read in a split second.',
    role: 'Creative direction · Thumbnail concept',
    published: true,
    featured: true,
    concept: true,
    order: 1
  },
  {
    id: 'concept-cosmic',
    slug: 'cosmic-egg',
    title: 'The Cosmic Upgrade',
    category: 'Thumbnails',
    image: '/assets/cosmic-egg.webp',
    video: '',
    description: 'Small beginning. Cosmic possibilities. A progression concept with a larger-than-life reward.',
    objective: 'Turn a progression system into a visually compelling promise.',
    hook: 'A strong contrast in scale makes the next upgrade the hero of the composition.',
    role: 'Creative direction · Thumbnail concept',
    published: true,
    featured: true,
    concept: true,
    order: 2
  },
  {
    id: 'concept-dragon',
    slug: 'dragon-escape',
    title: 'Dragon Egg Escape',
    category: 'Thumbnails',
    image: '/assets/dragon-escape.webp',
    video: '',
    description: 'One stolen egg. One very unhappy dragon. A chase concept built around urgency and character.',
    objective: 'Communicate danger, reward, and the player’s role in one frame.',
    hook: 'A close character reaction creates a focal point, while the dragon completes the story.',
    role: 'Creative direction · Thumbnail concept',
    published: true,
    featured: false,
    concept: true,
    order: 3
  },
  {
    id: 'concept-growth',
    slug: 'legendary-orchard',
    title: 'Grow Something Legendary',
    category: 'Thumbnails',
    image: '/assets/orchard-upgrade.webp',
    video: '',
    description: 'A playful orchard progression concept that turns growth into the main attraction.',
    objective: 'Make the transformation from ordinary to extraordinary easy to understand.',
    hook: 'A clear visual progression celebrates the reward at the end of the game loop.',
    role: 'Creative direction · Thumbnail concept',
    published: true,
    featured: false,
    concept: true,
    order: 4
  }
];

export const defaultSettings = {
  email: '',
  discordUrl: '',
  xUrl: '',
  tagline: 'Thumbnails and trailers built around what makes your game worth playing.',
  packages: [
    {
      id: 'lab',
      name: 'MONDO LAB',
      subtitle: 'Find your strongest hook.',
      price: 'Request a quote',
      cadence: 'per creative pack',
      features: [
        '3 distinct thumbnail concepts',
        'Export-ready images',
        'Creative direction & review'
      ],
      monthly: false,
      highlighted: false
    },
    {
      id: 'launch',
      name: 'MONDO LAUNCH',
      subtitle: 'Make your next release an event.',
      price: 'Request a quote',
      cadence: 'per project',
      features: [
        '1 game trailer',
        '3 thumbnail concepts',
        'Social cutdowns scoped to your launch'
      ],
      monthly: false,
      highlighted: true
    },
    {
      id: 'custom',
      name: 'YOUR NEXT MOVE',
      subtitle: 'A scope that fits your game.',
      price: 'Let’s talk',
      cadence: 'custom project',
      features: [
        'Individual thumbnails or trailers',
        'Launch & update visuals',
        'A brief built around your goals'
      ],
      monthly: false,
      highlighted: false
    },
    {
      id: 'loop',
      name: 'MONDO LOOP',
      subtitle: 'Keep your game in the conversation.',
      price: 'Request a quote',
      cadence: 'per month',
      features: [
        '2 thumbnails every week',
        '1 game trailer every month',
        'A planned creative schedule'
      ],
      monthly: true,
      highlighted: false
    },
    {
      id: 'plus',
      name: 'MONDO PLUS',
      subtitle: 'More ideas. More ways to stand out.',
      price: 'Request a quote',
      cadence: 'per month',
      features: [
        '4 thumbnails every week',
        '2 game trailers every month',
        'One trailer every two weeks'
      ],
      monthly: true,
      highlighted: true
    },
    {
      id: 'studio',
      name: 'MONDO STUDIO',
      subtitle: 'A creative partner for every update.',
      price: 'Request a quote',
      cadence: 'per month',
      features: [
        '7 thumbnails every week',
        '4 game trailers every month',
        'An ongoing creative schedule'
      ],
      monthly: true,
      highlighted: false
    }
  ],
  services: [
    {
      title: 'Game Thumbnails',
      description: 'One frame. A whole reason to play.',
      detail: 'Clear concepts, expressive characters, and compositions that communicate your game at a glance.'
    },
    {
      title: 'Game Trailers',
      description: 'Show the fun. Build the anticipation.',
      detail: 'From the first hook to the final frame: creative direction, gameplay storytelling, editing, and sound scoped to your game.'
    },
    {
      title: 'Creative Testing',
      description: 'Find the idea your players respond to.',
      detail: 'Explore distinct hooks and visual directions, then use the performance data you share to plan the next creative round.'
    }
  ],
  faqs: [
    {
      question: 'What do you need to get started?',
      answer: 'Send your game link or a description of the core gameplay, the assets you need, and any references. If your game is not live yet, a short overview is enough to start the conversation.'
    },
    {
      question: 'Can I order a thumbnail or trailer on its own?',
      answer: 'Yes. Individual thumbnails and game trailers are available alongside launch packs and ongoing creative plans. Tell us what you need and we’ll scope the project with you.'
    },
    {
      question: 'How do the monthly plans work?',
      answer: 'Each plan pairs a weekly thumbnail allowance with a monthly trailer allowance. The creative calendar, trailer length, revisions, and asset requirements are agreed before work begins.'
    },
    {
      question: 'What about delivery times and revisions?',
      answer: 'Delivery dates and included revision rounds are confirmed in your project quote. Scope and timing depend on the creative direction, available assets, and the number of deliverables.'
    },
    {
      question: 'Do you capture gameplay or use my footage?',
      answer: 'We agree on the capture approach in the brief. Let us know whether you already have footage, game access, character rigs, and other assets so the quote covers the work you need.'
    },
    {
      question: 'Can you guarantee performance?',
      answer: 'Creative work is designed to attract the right attention. Results also depend on your audience, distribution, and game experience. When you share testing data, we can use it to inform future concepts.'
    }
  ]
};

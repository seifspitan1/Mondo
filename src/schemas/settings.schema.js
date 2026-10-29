import { z } from 'zod';
import { safeUrl, firstError } from './common.js';

export { firstError };

export const packageSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  subtitle: z.string().max(180),
  price: z.string().min(1).max(100),
  cadence: z.string().max(80),
  features: z.array(z.string().min(1).max(200)).min(1).max(8),
  monthly: z.boolean(),
  highlighted: z.boolean()
});

export const settingsSchema = z.object({
  email: z.union([z.literal(''), z.string().email()]),
  discordUrl: safeUrl.refine(
    (v) => !v || /^https:\/\/(discord\.(gg|com)|www\.discord\.com)\//i.test(v),
    'Use a Discord link.'
  ),
  xUrl: safeUrl,
  tagline: z.string().min(5).max(250),
  packages: z.array(packageSchema).max(12),
  services: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        description: z.string().max(180),
        detail: z.string().max(600)
      })
    )
    .min(1)
    .max(6),
  faqs: z
    .array(
      z.object({
        question: z.string().min(1).max(200),
        answer: z.string().min(1).max(1500)
      })
    )
    .max(16)
});

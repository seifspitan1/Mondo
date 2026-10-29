import { z } from 'zod';
import { mediaUrl, safeUrl, webUrl, firstError } from './common.js';

export { mediaUrl, safeUrl, webUrl, firstError };

export const projectSchema = z
  .object({
    id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(2).max(120),
    category: z.enum(['Thumbnails', 'Trailers', 'Campaigns']),
    image: mediaUrl.refine(Boolean, 'Add a cover image.'),
    video: mediaUrl.default(''),
    description: z.string().trim().min(5).max(3000),
    objective: z.string().max(1500).default(''),
    hook: z.string().max(1500).default(''),
    role: z.string().max(300).default(''),
    published: z.boolean().default(false),
    featured: z.boolean().default(false),
    concept: z.boolean().default(false),
    order: z.number().int().min(0).max(9999).default(0)
  })
  .refine((p) => !p.published || p.category !== 'Trailers' || !!p.video, {
    message: 'Published trailers need a video.',
    path: ['video']
  });

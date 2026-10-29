import { z } from 'zod';

export const eventSchema = z.object({
  type: z.enum(['project_open', 'trailer_play', 'form_start']),
  slug: z.string().max(100).regex(/^[a-z0-9-]*$/).default('')
});

import { z } from 'zod';
import { safeUrl, firstError } from './common.js';

export { firstError };

export const enquirySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, 'Please add your name or studio.').max(120),
  email: z.string().trim().email('Please use a valid email.').max(254),
  discord: z.string().trim().max(120).default(''),
  gameUrl: safeUrl.default(''),
  service: z.enum([
    'Game Thumbnails',
    'Game Trailers',
    'Launch Pack',
    'Monthly Creatives',
    'Creative Testing',
    'Custom Project'
  ]),
  packageName: z.string().max(100).default(''),
  goal: z.string().trim().min(15, 'Tell us a little more about your game and goal.').max(5000),
  budget: z.string().max(150).default(''),
  deadline: z.string().max(50).default(''),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Please agree to the privacy notice.' })
  }),
  website: z.string().max(0, 'Please leave this field empty.').optional()
});

export const enquiryStatuses = ['New', 'Contacted', 'Quoted', 'Won', 'Closed'];

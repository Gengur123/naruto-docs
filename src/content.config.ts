import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Keys that generators add to page frontmatter. Starlight drops undeclared keys silently,
// so every key is declared here and enum values are checked at build time.
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        status: z.enum(['red', 'yellow', 'green']).optional(),
        confidence: z.number().min(0).max(100).optional(),
        sprint: z.string().optional(),
      }),
    }),
  }),
};

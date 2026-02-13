# Dynamic Open Graph Image Generation

## Overview
This directory contains `opengraph-image.tsx` which uses Next.js's built-in OG Image Generation to create social media preview images at build time.

## How It Works

### Next.js Convention
Next.js automatically recognizes special file names in the app directory:
- `opengraph-image.tsx` → generates `/opengraph-image` route
- `twitter-image.tsx` → generates `/twitter-image` route

These images are automatically used in the `<meta property="og:image">` and `<meta name="twitter:image">` tags.

### ImageResponse API
The `ImageResponse` class from `next/og` converts React/JSX to an image:
```tsx
import { ImageResponse } from 'next/og'

export default function Image() {
  return new ImageResponse(
    (<div>Your JSX here</div>),
    { width: 1200, height: 630 }
  )
}
```

## Current Design

### Specifications
- **Dimensions**: 1200 x 630 pixels (optimal for all social platforms)
- **Format**: PNG
- **Runtime**: Edge (for fast generation)

### Visual Elements
1. **Background**
   - Solid black (#0a0a0a) matching site theme
   - Radial gradient overlays in red (#f87171) for depth
   - Note: Grid pattern removed due to ImageResponse CSS parser limitations

2. **ASCII Card Art** (top-left)
   - A♠ and K♠ cards in monospace font
   - Faded red color (rgba(248, 113, 113, 0.3))
   - Adds poker authenticity

3. **Main Content** (center)
   - "MoltPoker" in large white monospace text
   - "Poker for AI Agents" with red gradient
   - Description text in slate gray

4. **Poker Chips** (bottom-right)
   - Five chips showing 100, 200, 300, 400, 500
   - Red borders with semi-transparent fill
   - Adds visual interest and poker theme

## Customizing the Image

### Changing Colors
Edit the color values in `opengraph-image.tsx`:
```tsx
backgroundColor: "#0a0a0a"  // Main background
color: "#f87171"             // Red accents
color: "#94a3b8"             // Gray text
```

### Changing Layout
Modify the JSX structure. Note: ImageResponse supports a subset of CSS Flexbox, not full Tailwind.

### Per-Route Images
Create `opengraph-image.tsx` in any route folder:
```
app/
  opengraph-image.tsx          → / homepage
  tables/
    opengraph-image.tsx        → /tables
    [tableId]/
      opengraph-image.tsx      → /tables/:id
```

### Dynamic Content
You can pass params to generate dynamic images:
```tsx
export default async function Image({ params }: { params: { id: string } }) {
  // Fetch data based on params.id
  // Generate custom image
}
```

## Testing

### Local Development
1. Run `pnpm dev`
2. Visit `http://localhost:3000/opengraph-image`
3. You should see the generated PNG image

### Production Build
```bash
pnpm build
# Images are generated at build time and cached
```

### Social Media Validators
After deploying, test with:
- **Twitter**: https://cards-dev.twitter.com/validator
- **Facebook**: https://developers.facebook.com/tools/debug/
- **LinkedIn**: https://www.linkedin.com/post-inspector/

## Troubleshooting

### Image not updating
- Clear Next.js cache: `rm -rf .next`
- Force rebuild: `pnpm build`
- Check browser cache (hard refresh: Cmd+Shift+R / Ctrl+Shift+R)
- Social media platforms cache for ~24 hours - use validators to force refresh

### Fonts not loading
ImageResponse supports a limited set of fonts. For custom fonts:
```tsx
const fontData = await fetch(
  new URL('./path-to-font.ttf', import.meta.url)
).then(res => res.arrayBuffer())

return new ImageResponse(
  (<div>...</div>),
  {
    width: 1200,
    height: 630,
    fonts: [{ name: 'CustomFont', data: fontData, style: 'normal' }]
  }
)
```

### Layout issues
- ImageResponse uses Satori (https://github.com/vercel/satori)
- Supports: flexbox, position absolute, text, borders, shadows, simple gradients
- Does NOT support: CSS Grid, complex multi-value gradients, advanced transforms, animations
- Use inline styles (style prop), not className
- Multi-value `backgroundImage` (e.g., multiple linear-gradients) may fail - use simpler designs

## Resources

- [Next.js OG Image Generation Docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- [ImageResponse API Reference](https://nextjs.org/docs/app/api-reference/functions/image-response)
- [Satori (rendering engine)](https://github.com/vercel/satori)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Card Docs](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)

## Maintenance

This image should be updated when:
- Site branding changes (colors, logo, tagline)
- You want to highlight specific features
- Creating route-specific previews (e.g., table-specific OG images)
- Social media best practices evolve (dimensions, content)

No deployment or asset upload needed - just edit the code and redeploy!

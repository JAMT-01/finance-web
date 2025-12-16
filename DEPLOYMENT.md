# Deploying to Cloudflare Pages

This guide will help you deploy your Personal Finance web app to Cloudflare Pages.

## Prerequisites

- A Cloudflare account (free tier works)
- Your Supabase credentials (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`)

## Deployment Methods

### Method 1: Deploy via Cloudflare Dashboard (Recommended)

1. **Build your project locally** (optional, but recommended to test):
   ```bash
   npm run build
   ```

2. **Go to Cloudflare Dashboard**:
   - Visit [dash.cloudflare.com](https://dash.cloudflare.com)
   - Navigate to **Pages** → **Create a project**

3. **Connect your Git repository**:
   - Connect your GitHub/GitLab/Bitbucket account
   - Select your `personal-finance-web` repository
   - Click **Begin setup**

4. **Configure build settings**:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (leave as default)

5. **Set Environment Variables**:
   - Go to **Settings** → **Environment Variables**
   - Add the following variables for **Production**:
     - `VITE_SUPABASE_URL` = Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = Your Supabase anonymous key
   - Optionally add them for **Preview** environments too

6. **Deploy**:
   - Click **Save and Deploy**
   - Cloudflare will build and deploy your site
   - Your site will be available at `https://your-project-name.pages.dev`

### Method 2: Deploy via Wrangler CLI

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Build your project**:
   ```bash
   npm run build
   ```

4. **Deploy to Cloudflare Pages**:
   ```bash
   wrangler pages deploy dist --project-name=personal-finance-web
   ```

5. **Set Environment Variables** (via CLI or Dashboard):
   ```bash
   wrangler pages secret put VITE_SUPABASE_URL
   wrangler pages secret put VITE_SUPABASE_ANON_KEY
   ```
   Or set them in the Cloudflare Dashboard under your Pages project settings.

### Method 3: Deploy via GitHub Actions (CI/CD)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: personal-finance-web
          directory: dist
```

Then add these secrets to your GitHub repository:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Custom Domain (Optional)

1. In Cloudflare Pages dashboard, go to your project
2. Click **Custom domains** → **Set up a custom domain**
3. Enter your domain name
4. Follow the DNS configuration instructions

## Important Notes

- The `_redirects` file in the `public` folder ensures SPA routing works correctly
- Environment variables prefixed with `VITE_` are exposed to the client-side code
- Your Supabase keys will be visible in the browser (this is normal for public keys)
- Service Worker (PWA) functionality will work on Cloudflare Pages
- Cloudflare Pages provides free SSL certificates automatically

## Troubleshooting

- **Build fails**: Check that all dependencies are in `package.json`
- **Routing doesn't work**: Ensure `_redirects` file is in the `public` folder
- **Environment variables not working**: Make sure they're set in Cloudflare Pages settings, not just locally
- **Service Worker issues**: Clear your browser cache and check the `sw.js` file is being served correctly


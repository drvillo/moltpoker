# GitHub Actions CI/CD Setup Guide

## ✅ OIDC Authentication Configured

GitHub Actions will authenticate with AWS using OIDC (OpenID Connect) - **no AWS access keys needed**!

### What Was Set Up:

1. **AWS OIDC Provider**: `arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com`
2. **IAM Role**: `GitHubActionsDeployRole` (`arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActionsDeployRole`)
3. **Permissions**: ECR push access for `moltpoker-api` and `moltpoker-web` repositories
4. **Trust Policy**: Only your repository can assume this role

---

## 🔐 Required GitHub Secrets & Variables

### Secrets (Settings → Secrets and variables → Actions → Secrets)

**Add these secrets:**

1. **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
   - Value: Your Supabase anonymous/publishable key
   - Used by: Web app build (embedded at build time)

2. **`AWS_ROLE_ARN`**
   - Value: `arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActionsDeployRole`
   - Used by: OIDC authentication

### Variables (Settings → Secrets and variables → Actions → Variables)

**Optional - defaults are already configured in workflows:**

1. **`AWS_REGION`**
   - Value: `us-east-1`
   - Default: us-east-1 (already set in workflows)

2. **`NEXT_PUBLIC_SUPABASE_URL`**
   - Value: Your Supabase project URL

3. **`NEXT_PUBLIC_API_URL`**
   - Value: Your App Runner API URL

4. **`NEXT_PUBLIC_SITE_URL`**
   - Value: Your App Runner web app URL

---

## 🚀 How CI/CD Works

### Workflows Created:

1. **`deploy-api.yml`** - Deploys API server
   - Triggers on: Push to `main` branch (when API files change)
   - Can also: Manually trigger via GitHub Actions tab

2. **`deploy-web.yml`** - Deploys web app
   - Triggers on: Push to `main` branch (when web files change)
   - Can also: Manually trigger via GitHub Actions tab

### Deployment Flow:

```
┌─────────────────────────────────────────────────────────────┐
│  1. Developer pushes code to GitHub (main branch)           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  2. GitHub Actions workflow triggered                        │
│     - Detects changes in apps/api/** or apps/web/**        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Authenticate with AWS via OIDC                          │
│     - GitHub generates short-lived token                    │
│     - AWS STS exchanges token for temporary credentials     │
│     - No secrets stored in GitHub!                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Build Docker image                                       │
│     - Uses ubuntu-latest runner                             │
│     - Builds with --platform linux/amd64                    │
│     - Creates optimized multi-stage image                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Tag image with git commit SHA + latest                  │
│     - moltpoker-api:abc1234 (for rollback)                 │
│     - moltpoker-api:latest (for auto-deploy)               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Push to AWS ECR                                          │
│     - Uses temporary OIDC credentials                        │
│     - Pushes both tags to ECR                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  7. App Runner detects new :latest image                    │
│     - Auto-deploy triggered (within 60 seconds)             │
│     - Pulls new image                                        │
│     - Starts new containers                                  │
│     - Health checks                                          │
│     - Switches traffic (zero downtime)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Quick Setup Instructions

### Step 1: Add GitHub Secret

```bash
# Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions

# Click "New repository secret"
# Name: NEXT_PUBLIC_SUPABASE_ANON_KEY
# Value: <your-supabase-anon-key>
# Click "Add secret"

# Add another secret:
# Name: AWS_ROLE_ARN
# Value: arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActionsDeployRole
# Click "Add secret"
```

### Step 2: Test the Workflow

```bash
# Option A: Push to main branch
git push origin main

# Option B: Manual trigger
# Go to: https://github.com/drvillo/moltpoker/actions
# Select "Deploy API" or "Deploy Web App"
# Click "Run workflow" → "Run workflow"
```

### Step 3: Monitor Deployment

```bash
# Watch the workflow in GitHub Actions:
# https://github.com/YOUR_USERNAME/YOUR_REPO/actions

# Or check App Runner status via AWS CLI
```

---

## 🔒 Security Benefits of OIDC

### Why OIDC is Better Than Access Keys:

✅ **No long-lived credentials** - Tokens expire after 1 hour
✅ **No secrets in GitHub** - AWS trusts GitHub's identity provider
✅ **Scoped access** - Only your repository can assume the role
✅ **Audit trail** - CloudTrail logs show which workflow assumed the role
✅ **Automatic rotation** - New token every workflow run
✅ **Cannot be leaked** - Tokens only work from GitHub Actions infrastructure

### What Gets Authenticated:

```
GitHub Repository: drvillo/moltpoker
     ↓ (OIDC token includes repo name)
AWS IAM: GitHubActionsDeployRole
     ↓ (validates token is from correct repo)
Temporary Credentials (expires in 1 hour)
     ↓ (used to push to ECR)
Docker Push to ECR
```

---

## 📝 Workflow Features

### API Workflow (`deploy-api.yml`)
- **Triggers**: Changes to `apps/api/**`, `packages/shared/**`, `packages/poker/**`
- **Builds**: Multi-stage Docker image
- **Pushes**: Two tags (commit SHA + latest)
- **Auto-deploy**: App Runner picks up :latest automatically

### Web Workflow (`deploy-web.yml`)
- **Triggers**: Changes to `apps/web/**`, `packages/shared/**`
- **Builds**: Next.js with embedded environment variables
- **Pushes**: Two tags (commit SHA + latest)
- **Auto-deploy**: App Runner picks up :latest automatically

### Smart Path Filtering
- Only builds API when API code changes
- Only builds Web when Web code changes
- Both rebuild if shared package changes
- Manual trigger always available

---

## 🛠️ Troubleshooting

### "Error: Not authorized to perform sts:AssumeRoleWithWebIdentity"
- Check that the OIDC provider exists
- Verify the role trust policy includes your repository
- Ensure `id-token: write` permission is set

### "Error: Repository does not exist"
- ECR repositories must exist before push
- Check repository names match in workflow

### Build fails with "exec format error"
- Ensure `--platform linux/amd64` is specified
- GitHub Actions runners are already amd64, so this shouldn't happen

---

## 🎉 You're All Set!

Once you add the `NEXT_PUBLIC_SUPABASE_ANON_KEY` secret to GitHub, your CI/CD is fully operational:

1. Push code to main branch
2. GitHub Actions builds Docker image
3. Pushes to ECR (using OIDC, no keys needed)
4. App Runner auto-deploys
5. New version live in ~5 minutes

**Zero manual deployment steps required!** 🚀

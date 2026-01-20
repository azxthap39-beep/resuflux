# GitHub Authentication Guide (Google Auth) 🛡️

Since you use Google Authentication for GitHub, standard terminal commands like `git push` won't accept your Google password. You need to use a **Personal Access Token (PAT)** as your password.

## Step 1: Generate your Access Token
1. Go to your GitHub **Settings** (click your profile pic -> Settings).
2. On the left sidebar, scroll to the bottom and click **Developer settings**.
3. Click **Personal access tokens** -> **Tokens (classic)**.
4. Click **Generate new token** -> **Generate new token (classic)**.
5. **Note**: Call it "ResuFlux Terminal".
6. **Expiration**: 7 days (or whatever you prefer).
7. **Scopes**: Select **repo** (this is the only one you need).
8. Click **Generate token**.
9. ⚠️ **IMPORTANT**: Copy the token immediately. You won't see it again!

## 🚨 Fixed: Common 403 Error
GitHub is very picky about the username. Based on your error:

1. **Username**: Use **ONLY** `azxthap39-beep`. Do **NOT** include your full name or parentheses.
2. **Password**: This must be the **Token** (starting with `ghp_`), not your Google password.

### The "Forced" Fix (Best Option)
To bypass the confusing prompts entirely, run this command in your terminal. It embeds the token so you don't have to type it:

```bash
# 1. Reset the remote to include your token
# Replace YOUR_TOKEN_HERE with the code you generated on GitHub
git remote set-url origin https://azxthap39-beep:YOUR_TOKEN_HERE@github.com/azxthap39-beep/resuflux.git

# 2. Push again (it won't ask for a password this time)
git push -u origin main
```

---

## Step 3: Troubleshooting
If you still get "Permission Denied":
- **Check Scopes**: Make sure when you generated the token, you checked the box for **repo**.
- **Typos**: Ensure there are no spaces when you copy-paste the token.

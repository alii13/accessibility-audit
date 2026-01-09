# Setup Instructions

This is a clean copy of the WAVE accessibility analyzer, designed to be used in other projects via GitHub Actions.

## Key Differences from Original

✅ **Removed:**
- `urls.ts` - No hardcoded URLs
- Hardcoded credentials in `run-test.ts`
- Publishing documentation (not needed for this use case)

✅ **Updated:**
- `run-test.ts` - Now requires all configuration via environment variables
- `package.json` - Simplified for direct use
- `README.md` - Focused on CI/CD usage

## Files Included

- `run-test.ts` - Main test runner (requires env vars)
- `wave-test.ts` - WAVE analysis logic
- `wave.min.js` - WAVE library
- `analyzer.js` - Core analyzer class
- `cli.js` - CLI interface
- `tsconfig.json` - TypeScript configuration
- `package.json` - Dependencies
- `README.md` - Usage documentation

## Required Environment Variables

All configuration is done via environment variables:

- `DOMAIN` - Base domain (required)
- `TEST_URLS` - Comma-separated URLs (required)
- `LOGIN_USERNAME` - Username (required)
- `LOGIN_PASSWORD` - Password (required)
- `HEADLESS` - Set to 'true' for CI/CD (optional, defaults to false)

## Usage in GitHub Actions

See `README.md` for complete GitHub Actions workflow example.

The workflow should:
1. Clone this repository
2. Install dependencies (`pnpm install`)
3. Install Playwright browsers (`pnpm run install-browsers`)
4. Set environment variables
5. Run tests (`pnpm run wave-test`)

## Next Steps

1. Push this directory to a new GitHub repository
2. Use it in your other project's GitHub Actions workflow
3. Configure secrets in your project repository settings




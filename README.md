# 🌊 WAVE Accessibility Audit

A clean, environment-variable-driven WAVE accessibility analyzer designed for CI/CD pipelines. **No hardcoded URLs or credentials!**

## ✨ Features

- 🚀 **No Hardcoded Data** - All configuration via environment variables
- 🤖 **CI/CD Ready** - Designed for GitHub Actions and other CI/CD platforms
- 📊 **Batch Processing** - Analyze multiple URLs automatically
- 🖥️ **Headless Support** - Runs seamlessly in headless mode
- 📄 **CSV & JSON Reports** - Detailed accessibility reports

## 📋 Requirements

- Node.js 16+
- Playwright browsers (installed automatically)


## 🚀 Quick Start

### Installation

```bash
# Clone this repository
git clone <your-repo-url>
cd wave-accessibility-audit

# Install dependencies
pnpm install

# Install Playwright browsers
pnpm run install-browsers
```

### Running Tests

# Run tests
pnpm run wave-test
```

## 📦 Using in GitHub Actions

### Example Workflow

```yaml
name: Internal Accessibility Audit

on:
    schedule:
        - cron: '0 6 * * 0' # Run weekly on Sunday at 11:30 AM IST
    workflow_dispatch:
        inputs:
            urls:
                description: 'Comma-separated list of URLs to test'
                required: false
                default: ''
            domain:
                description: 'Base domain for the application'
                required: true
                default: ''

permissions:
    contents: read
    pages: read
    id-token: write
    actions: read
    pull-requests: write
    issues: write

jobs:
    accessibility-audit:
        runs-on: ubuntu-latest
        env:
            DOMAIN: ${{ github.event.inputs.domain }}
            TEST_URLS: ${{ github.event.inputs.urls || format('{0}/about', github.event.inputs.domain) }}
            HEADLESS: 'true'
            LOGIN_USERNAME: ${{ secrets.PREVIEW_USERNAME }}
            LOGIN_PASSWORD: ${{ secrets.PREVIEW_PASSWORD }}
        steps:
            - uses: actions/checkout@v4

            - name: Setup pnpm
              uses: pnpm/action-setup@v4
              with:
                  version: 9

            - name: Setup Node
              uses: actions/setup-node@v4
              with:
                  node-version: 22
                  cache: 'pnpm'

            - name: Clone accessibility audit repository
              run: |
                  git clone -b main https://github.com/alii13/accessibility-audit.git wave-accessibility-audit
                  cd wave-accessibility-audit
                  # Remove any existing node_modules to ensure clean install
                  rm -rf node_modules
                  # Install dependencies
                  pnpm install

            - name: Install Playwright browsers
              run: |
                  cd wave-accessibility-audit
                  pnpm run install-browsers

            - name: Run accessibility tests
              working-directory: wave-accessibility-audit
              env:
                  DOMAIN: ${{ env.DOMAIN }}
                  TEST_URLS: ${{ env.TEST_URLS }}
                  HEADLESS: ${{ env.HEADLESS }}
                  LOGIN_USERNAME: ${{ env.LOGIN_USERNAME }}
                  LOGIN_PASSWORD: ${{ env.LOGIN_PASSWORD }}
              run: pnpm run wave-test

            - name: Copy results to project root
              if: always()
              run: |
                  mkdir -p ./accessibility-results
                  cp -r wave-accessibility-audit/results/* ./accessibility-results/ || true

            - name: Upload results
              if: always()
              uses: actions/upload-artifact@v4
              with:
                  name: accessibility-results
                  path: |
                      ./accessibility-results/
                  retention-days: 30

            - name: Create GitHub Issue for Violations
              if: failure()
              uses: actions/github-script@v7
              with:
                  script: |
                      const fs = require('fs');
                      const path = require('path');
                      
                      let violationCount = 0;
                      let summary = '## Accessibility Test Results\n\n';
                      
                      try {
                          const resultsDir = './accessibility-results';
                          if (fs.existsSync(resultsDir)) {
                              const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.csv'));
                              summary += `Found ${files.length} test result file(s).\n\n`;
                              
                              // Count violations from CSV files
                              // Skip metadata lines and header row
                              for (const file of files) {
                                  try {
                                      const content = fs.readFileSync(path.join(resultsDir, file), 'utf8');
                                      const lines = content.split('\n').filter(line => {
                                          const trimmed = line.trim();
                                          // Skip empty lines, metadata lines (starting with #), and header row
                                          return trimmed.length > 0 && 
                                                 !trimmed.startsWith('#') && 
                                                 trimmed.includes(',') &&
                                                 !trimmed.includes('Rule ID'); // Skip header row
                                      });
                                      violationCount += lines.length;
                                  } catch (err) {
                                      console.log(`Error reading ${file}: ${err.message}`);
                                  }
                              }
                              
                              summary += `**Total accessibility issues found: ${violationCount}**\n\n`;
                          } else {
                              summary += 'No results directory found.\n';
                          }
                      } catch (error) {
                          summary += `Error reading results: ${error.message}\n`;
                      }
                      
                      summary += '\n## Detailed Report\n';
                      summary += 'The full report is available in the workflow artifacts.\n\n';
                      summary += 'Please review and address these accessibility issues.';

                      const issueTitle = `Accessibility Violations Found - ${new Date().toISOString().split('T')[0]}`;
                      
                      await github.rest.issues.create({
                          owner: context.repo.owner,
                          repo: context.repo.repo,
                          title: issueTitle,
                          body: summary,
                          labels: ['accessibility', 'bug']
                      });
```

## 📝 URL Format

The `TEST_URLS` environment variable accepts:

- **Comma-separated**: `/about,/contact`
- **Newline-separated**: `\n/about\n/contact`
- **Full URLs**: `https://example.com/page1,https://example.com/page2`
- **Mixed**: `/relative-path,https://full-url.com/page`

Relative paths will be automatically prepended with the `DOMAIN` value.

## 📊 Output

Results are saved to the `results/` directory:

- **CSV files**: `accessibility-results-{domain}-{path}.csv`
- **JSON files**: `accessibility-results-{domain}-{path}.json`

Each file contains detailed accessibility issues including:
- Error types and counts
- Contrast issues
- WCAG compliance information
- Element locations and descriptions

## 🔒 Security

- **No hardcoded credentials** - All authentication via environment variables
- **No hardcoded URLs** - All URLs provided via environment variables
- **Safe for public repositories** - No sensitive data in code

## 🐛 Error Handling

The script will exit with an error code if:
- `DOMAIN` is not set
- `TEST_URLS` is not set
- `LOGIN_USERNAME` or `LOGIN_PASSWORD` is not set

This ensures your CI/CD pipeline fails appropriately when configuration is missing.

## 📄 License

MIT License - feel free to use in your projects!

---

**Happy accessibility testing! 🌊✨**

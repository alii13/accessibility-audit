import { Page, chromium } from 'playwright'
import { runAccessibilityTest } from './wave-test'

// Get domain from environment variable (required)
const DOMAIN = process.env.DOMAIN
if (!DOMAIN) {
    console.error('❌ Error: DOMAIN environment variable is required')
    console.error('Please set DOMAIN environment variable (e.g., https://example.com)')
    process.exit(1)
}

// Get URLs from environment variable (required)
const TEST_URLS = process.env.TEST_URLS
if (!TEST_URLS) {
    console.error('❌ Error: TEST_URLS environment variable is required')
    console.error('Please set TEST_URLS environment variable (e.g., /home,/about,/contact)')
    process.exit(1)
}

// Type assertions after validation - TypeScript doesn't narrow types across scopes
const DOMAIN_STR: string = DOMAIN
const TEST_URLS_STR: string = TEST_URLS

// Parse URLs - support both comma-separated and newline-separated
const urls = TEST_URLS_STR
    .split(/[,\n]/)
    .map(url => url.trim())
    .filter(url => url.length > 0)
    .map(url => {
        // If URL already starts with http, use as-is, otherwise prepend domain
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url
        }
        // Ensure URL starts with / if it's a relative path
        const relativePath = url.startsWith('/') ? url : `/${url}`
        return `${DOMAIN_STR}${relativePath}`
    })

// Get login credentials from environment variables (required)
const LOGIN_USERNAME = process.env.LOGIN_USERNAME
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD

if (!LOGIN_USERNAME || !LOGIN_PASSWORD) {
    console.error('❌ Error: LOGIN_USERNAME and LOGIN_PASSWORD environment variables are required')
    process.exit(1)
}

// Type assertions after validation
const LOGIN_USERNAME_STR: string = LOGIN_USERNAME
const LOGIN_PASSWORD_STR: string = LOGIN_PASSWORD

async function login({ page }: { page: Page }) {
    try {
        // Navigate to the domain
        await page.goto(DOMAIN_STR)
        
        // Wait for the login form to be visible
        await page.waitForSelector('#kc-form-login', { timeout: 30000 })
        
        // Fill in the login form
        await page.fill('#username', LOGIN_USERNAME_STR)
        await page.fill('#password', LOGIN_PASSWORD_STR)
        
        // Click the login button
        await page.click('#kc-login')
        
        // Wait for the profile dropdown to be visible, indicating successful login
        await page.waitForSelector('[data-test-id="nav-profile-dropdown"]', {
            timeout: 300000,
        })
        
        console.log('Successfully logged in')
    } catch (error) {
        console.error('Login failed:', error)
        throw error
    }
}

async function runTests() {
    let browser = null
    try {
        // Launch browser once
        console.log('🚀 Launching browser...')
        browser = await chromium.launch({ 
            headless: process.env.HEADLESS === 'true' 
        })
        const context = await browser.newContext()
        const page = await context.newPage()

        // Login once at the beginning
        console.log('🔐 Logging in...')
        await login({ page })
        console.log('✅ Login successful - will reuse session for all URLs\n')

        // Run tests for each URL using the same logged-in session
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i]
            console.log(
                `\n=== Starting accessibility test ${i + 1}/${urls.length}: ${url} ===\n`
            )
            
            try {
                // Run accessibility test using existing session
                await runAccessibilityTest(url, page)
                
                console.log(
                    `\n✅ Accessibility test completed successfully for ${url}\n`
                )
                
                // Small delay between URLs to avoid overwhelming the server
                if (i < urls.length - 1) {
                    console.log('⏳ Waiting 2 seconds before next URL...\n')
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
                
            } catch (error) {
                console.error(`\n❌ Error testing ${url}:`, error instanceof Error ? error.message : String(error))
                console.error('Continuing with next URL...\n')
                
                // Longer delay after errors to let things settle
                if (i < urls.length - 1) {
                    console.log('⏳ Waiting 5 seconds after error before next URL...\n')
                    await new Promise(resolve => setTimeout(resolve, 5000))
                }
            }
        }
        
        console.log('\n🎉 All tests completed!')
        
    } catch (error) {
        console.error('Error running tests:', error)
        process.exit(1)
    } finally {
        // Close browser only at the very end
        if (browser) {
            console.log('🧹 Closing browser...')
            await browser.close()
        }
    }
}

// Run the tests
runTests()

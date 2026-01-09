import { type Page, type BrowserContext } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

interface AccessibilityResult {
    impact: string | null | undefined
    description: string
    helpUrl: string
    helpText: string
    nodes: {
        html: string
        target: string
        failureSummary: string | undefined
    }[]
    rule: string
    wcagLevel: string
}

interface WaveRuleData {
    count: number
    xpaths: string[]
    selectors?: (string | boolean)[]
    text?: any[]
    hidden?: boolean[]
    description?: string
    domInfo?: any[]
    contrastdata?: any[]
}

interface WaveCategory {
    count: number
    items: Record<string, WaveRuleData>
}

interface WaveReport {
    error?: WaveCategory
    contrast?: WaveCategory
}

interface WaveResults {
    url: string
    timestamp: string
    testEngine: {
        name: string
        version: string
    }
    testRunner: {
        name: string
    }
    testEnvironment: {
        userAgent: string
        windowWidth: number
        windowHeight: number
        orientationType?: string
        orientationAngle?: number
    }
    violations: WaveReport
}

interface TestMetadata {
    testEngine: {
        name: string
        version: string
    }
    testRunner: {
        name: string
    }
    testEnvironment: {
        userAgent: string
        windowWidth: number
        windowHeight: number
        orientationAngle?: number
        orientationType?: string
    }
    timestamp: string
    url: string
}

function getWCAGLevel(tags: string[]): string {
    if (tags.includes('wcag2aaa')) return 'AAA'
    if (tags.includes('wcag2aa')) return 'AA'
    if (tags.includes('wcag2a')) return 'A'
    return 'N/A'
}

function generateFilename(url: string, extension: string): string {
    // Remove protocol (http:// or https://)
    let filename = url.replace(/^https?:\/\//, '')
    // Remove trailing slash
    filename = filename.replace(/\/$/, '')
    // Replace special characters with dashes
    filename = filename.replace(/[^a-zA-Z0-9]/g, '-')
    // Limit filename length to prevent filesystem errors (255 is typical max filename length)
    const maxBaseLength = 200 - extension.length - 1  // Reserve space for extension and dot
    if (filename.length > maxBaseLength) {
        filename = filename.substring(0, maxBaseLength)
    }
    return `accessibility-results-${filename}.${extension}`
}

function escapeCSV(field: string | null | undefined): string {
    if (field === null || field === undefined) {
        return '""'
    }
    const stringField = String(field)
    // If the field contains quotes, commas, or newlines, wrap it in quotes and escape internal quotes
    if (
        stringField.includes('"') ||
        stringField.includes(',') ||
        stringField.includes('\n')
    ) {
        return `"${stringField.replace(/"/g, '""')}"`
    }
    return stringField
}

function generateMetadataSection(metadata: TestMetadata): string {
    const orientationInfo =
        metadata.testEnvironment.orientationAngle !== undefined
            ? `${metadata.testEnvironment.orientationType} (${metadata.testEnvironment.orientationAngle}°)`
            : metadata.testEnvironment.orientationType

    return [
        'Test Information',
        `Test Engine,${escapeCSV(`${metadata.testEngine.name} v${metadata.testEngine.version}`)}`,
        `Test Runner,${escapeCSV(metadata.testRunner.name)}`,
        `Test URL,${escapeCSV(metadata.url)}`,
        `Timestamp,${escapeCSV(metadata.timestamp)}`,
        '',
        'Environment Information',
        `User Agent,${escapeCSV(metadata.testEnvironment.userAgent)}`,
        `Window Size,${escapeCSV(`${metadata.testEnvironment.windowWidth}x${metadata.testEnvironment.windowHeight}`)}`,
        `Orientation,${escapeCSV(orientationInfo || 'N/A')}`,
        '',
        'Test Results',
        '',
    ].join('\n')
}

export async function runAccessibilityTest(url: string, page: Page) {
    // Create results directory at the beginning
    const resultsDir = path.join(process.cwd(), 'results')
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir)
        console.log(`Created results directory: ${resultsDir}`)
    }

    try {
        console.log('Running accessibility test...')

        try {
            // Navigate to URL and wait maximum 8-9 seconds before proceeding
            console.log('Navigating to URL...')
            const startTime = Date.now();
            
            // Basic navigation - just need the page to start loading
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            console.log('Page navigation started')

            // Wait for page to stabilize but with hard timeout of 8-9 seconds
            console.log('Waiting for page to stabilize (max 8-9 seconds)...')
            
            const maxWaitTime = 30000; // 30 seconds max
            const remainingTime = maxWaitTime - (Date.now() - startTime);
            
            if (remainingTime > 0) {
                try {
                    // Try to wait for networkidle but don't wait longer than our budget
                    await page.waitForLoadState('networkidle', { timeout: Math.min(remainingTime, 6000) });
                    console.log('Page reached networkidle state')
                } catch (error) {
                    console.log('Page still loading, but proceeding with analysis...')
                }
                
                // Use any remaining time for basic DOM readiness
                const finalWaitTime = maxWaitTime - (Date.now() - startTime);
                if (finalWaitTime > 1000) {
                    try {
                        await page.waitForFunction(() => document.readyState === 'complete' && document.body !== null, { timeout: Math.min(finalWaitTime, 2000) });
                        console.log('DOM is ready')
                    } catch (error) {
                        console.log('DOM readiness check timed out, proceeding anyway...')
                    }
                }
            }
            
            const elapsedTime = Date.now() - startTime;
            console.log(`Page loading completed in ${elapsedTime}ms - proceeding with WAVE analysis`);

            // Run WAVE accessibility test using the same logic as analyzer.js
            console.log('Running WAVE analysis...');
            
            // Load WAVE script content (exactly like analyzer.js)
            const waveScriptPath = path.join(__dirname, 'wave.min.js');
            const waveScript = fs.readFileSync(waveScriptPath, 'utf8');
            
            const accessibilityScanResults = await page.evaluate((scriptContent: string) => {
                return new Promise((resolve, reject) => {
                    try {
                        // Set up WAVE configuration (same as analyzer.js)
                        (window as any).waveconfig = {
                            debug: false,
                            extensionUrl: "",
                            platform: "standalone",
                            browser: "chrome"
                        };

                        // Inject WAVE script (exactly like analyzer.js)
                        const scriptElement = document.createElement('script');
                        scriptElement.textContent = scriptContent;
                        document.head.appendChild(scriptElement);

                        // Function to enhance WAVE results (simplified version from analyzer.js)
                        function enhanceResultsWithDOMInfo(results: any) {
                            function getElementInfo(xpath: string) {
                                try {
                                    const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                                    if (!element) return null;
                                    
                                    return {
                                        tagName: (element as Element).tagName,
                                        id: (element as any).id || null,
                                        className: (element as any).className || null,
                                        textContent: element.textContent ? element.textContent.trim().substring(0, 100) : null,
                                        innerHTML: (element as Element).innerHTML ? (element as Element).innerHTML.substring(0, 200) : null,
                                        attributes: Array.from((element as Element).attributes || []).reduce((acc: any, attr) => {
                                            acc[attr.name] = attr.value;
                                            return acc;
                                        }, {}),
                                        selector: generateSelector(element as Element)
                                    };
                                } catch (error) {
                                    return { error: (error as Error).message };
                                }
                            }
                            
                            function generateSelector(element: Element): string {
                                if ((element as any).id) return `#${(element as any).id}`;
                                if ((element as any).className) {
                                    const classes = (element as any).className.trim().split(/\s+/).slice(0, 2).join('.');
                                    return `.${classes}`;
                                }
                                return element.tagName.toLowerCase();
                            }
                            
                            const enhanced = JSON.parse(JSON.stringify(results));
                            
                            // Filter to only include error and contrast categories
                            const filteredCategories: any = {};
                            if (enhanced.categories && enhanced.categories.error) {
                                filteredCategories.error = enhanced.categories.error;
                            }
                            if (enhanced.categories && enhanced.categories.contrast) {
                                filteredCategories.contrast = enhanced.categories.contrast;
                            }
                            
                            // Enhance error and contrast categories
                            Object.keys(filteredCategories).forEach(categoryKey => {
                                const category = filteredCategories[categoryKey];
                                if (category.items) {
                                    Object.keys(category.items).forEach(itemKey => {
                                        const item = category.items[itemKey];
                                        if (item.xpaths && Array.isArray(item.xpaths)) {
                                            // Deduplicate XPaths
                                            const uniqueXPaths = [...new Set(item.xpaths)] as string[];
                                            item.xpaths = uniqueXPaths;
                                            
                                            // Update count to reflect actual unique instances
                                            item.count = uniqueXPaths.length;
                                            
                                            // Get DOM info for unique XPaths only
                                            item.domInfo = uniqueXPaths.map((xpath: string) => getElementInfo(xpath)).filter(info => info !== null);
                                            
                                            // Also deduplicate other arrays that might have duplicates
                                            if (item.selectors && Array.isArray(item.selectors)) {
                                                item.selectors = item.selectors.slice(0, uniqueXPaths.length);
                                            }
                                            if (item.text && Array.isArray(item.text)) {
                                                item.text = item.text.slice(0, uniqueXPaths.length);
                                            }
                                            if (item.hidden && Array.isArray(item.hidden)) {
                                                item.hidden = item.hidden.slice(0, uniqueXPaths.length);
                                            }
                                            if (item.contrastdata && Array.isArray(item.contrastdata)) {
                                                item.contrastdata = item.contrastdata.slice(0, uniqueXPaths.length);
                                            }
                                        }
                                    });
                                }
                            });
                            
                            // Recalculate category counts after deduplication
                            Object.keys(filteredCategories).forEach(categoryKey => {
                                const category = filteredCategories[categoryKey];
                                if (category.items) {
                                    // Recalculate total count for this category
                                    category.count = Object.values(category.items).reduce((total: number, item: any) => total + (item.count || 0), 0);
                                }
                            });
                            
                            // Return only filtered categories
                            enhanced.categories = filteredCategories;
                            return enhanced;
                        }

                        // Wait for WAVE to initialize with retry logic (increased for better stability)
                        let attempts = 0;
                        const maxRetries = 100;
                        const retryDelay = 200;
                        
                        const checkWaveAvailability = () => {
                            attempts++;
                            
                            if (typeof (window as any).wave !== 'undefined' && (window as any).wave.fn) {
                                try {
                                    console.log('WAVE available, checking DOM readiness...');
                                    
                                    // Ensure DOM is completely ready before initializing WAVE
                                    if (document.readyState !== 'complete') {
                                        console.log('DOM not ready, waiting longer...');
                                        setTimeout(checkWaveAvailability, retryDelay);
                                        return;
                                    }
                                    
                                    // Check if body exists and has been styled (to avoid style errors)
                                    if (!document.body || !document.body.style || !document.head) {
                                        console.log('Body or head not ready, waiting...');
                                        setTimeout(checkWaveAvailability, retryDelay);
                                        return;
                                    }
                                    
                                    // Additional check for any elements that might cause style access issues
                                    try {
                                        // Try accessing style to see if it throws an error
                                        const testStyle = document.body.style.display;
                                        console.log('Style access test passed');
                                    } catch (styleError) {
                                        console.log('Style access test failed, waiting...', styleError);
                                        setTimeout(checkWaveAvailability, retryDelay);
                                        return;
                                    }
                                    
                                    console.log('DOM ready, initializing WAVE...');
                                    
                                    // Initialize WAVE with error handling
                                    try {
                                        (window as any).wave.fn.initialize();
                                        console.log('WAVE initialized successfully');
                                    } catch (initError) {
                                        console.log('WAVE initialization failed, retrying...', initError);
                                        if (attempts < maxRetries) {
                                            setTimeout(checkWaveAvailability, retryDelay * 2);
                                            return;
                                        } else {
                                            reject(new Error(`WAVE initialization failed after retries: ${(initError as Error).message}`));
                                            return;
                                        }
                                    }
                                    
                                    // Run WAVE analysis
                                    (window as any).wave.fn.run()
                                        .then((results: any) => {
                                            console.log('WAVE analysis completed successfully');
                                            // Enhance results with better DOM information
                                            const enhancedResults = enhanceResultsWithDOMInfo(results);
                                            
                                            resolve({
                                                url: window.location.href,
                                                timestamp: new Date().toISOString(),
                                                testEngine: {
                                                    name: 'WAVE',
                                                    version: '3.2.7'
                                                },
                                                testRunner: {
                                                    name: 'WAVE Standalone Analyzer'
                                                },
                                                testEnvironment: {
                                                    userAgent: navigator.userAgent,
                                                    windowWidth: window.innerWidth,
                                                    windowHeight: window.innerHeight,
                                                    orientationType: (screen as any).orientation?.type,
                                                    orientationAngle: (screen as any).orientation?.angle
                                                },
                                                violations: enhancedResults.categories || {}
                                            });
                                        })
                                        .catch((error: any) => {
                                            reject(new Error(`WAVE analysis execution failed: ${error.message}`));
                                        });
                                } catch (error) {
                                    console.log('Unexpected error in WAVE process:', error);
                                    if (attempts < maxRetries) {
                                        setTimeout(checkWaveAvailability, retryDelay * 2);
                                    } else {
                                        reject(new Error(`WAVE process failed: ${(error as Error).message}`));
                                    }
                                }
                            } else if (attempts >= maxRetries) {
                                reject(new Error(`WAVE failed to initialize after ${maxRetries} attempts`));
                            } else {
                                // Retry after delay
                                setTimeout(checkWaveAvailability, retryDelay);
                            }
                        };

                        checkWaveAvailability();

                    } catch (error) {
                        reject(new Error(`Script injection failed: ${(error as Error).message}`));
                    }
                });
            }, waveScript) as WaveResults;

            console.log('WAVE analysis completed, processing results...');

            // Extract metadata
            const metadata: TestMetadata = {
                testEngine: accessibilityScanResults.testEngine,
                testRunner: accessibilityScanResults.testRunner,
                testEnvironment: accessibilityScanResults.testEnvironment,
                timestamp: accessibilityScanResults.timestamp,
                url: accessibilityScanResults.url,
            }

            console.log('Metadata extracted successfully');

            // Process WAVE results for CSV output
            const csvRows: string[][] = []
            const waveResults = accessibilityScanResults.violations

            console.log('Processing WAVE results for CSV output...');
            console.log('WAVE results structure:', Object.keys(waveResults));

            // Process errors and contrast issues
            const categoriesToProcess = ['error', 'contrast'] as const
            
            for (const category of categoriesToProcess) {
                const categoryData = waveResults[category]
                if (categoryData && categoryData.count > 0) {
                    const items = categoryData.items
                    
                    for (const [ruleId, ruleData] of Object.entries(items)) {
                        const rule = ruleData as WaveRuleData
                        if (rule && rule.count > 0) {
                            // Deduplicate xpaths
                            const uniqueXpaths = [...new Set(rule.xpaths)]
                            
                            uniqueXpaths.forEach((xpath, index) => {
                                // Get additional info for this specific instance
                                const selectorValue = rule.selectors?.[index]
                                const selector = (typeof selectorValue === 'string') ? selectorValue : 'N/A'
                                const domInfo = rule.domInfo?.[index]
                                const contrastData = rule.contrastdata?.[index]
                                
                                // Build element info
                                let elementInfo = xpath
                                if (domInfo && typeof domInfo === 'object' && !domInfo.error) {
                                    elementInfo = `${domInfo.tagName || 'Unknown'}`
                                    if (domInfo.id) elementInfo += `#${domInfo.id}`
                                    if (domInfo.className) elementInfo += `.${domInfo.className.replace(/\s+/g, '.')}`
                                }
                                
                                // Build additional details
                                let additionalInfo = rule.description || ruleId
                                if (contrastData && Array.isArray(contrastData)) {
                                    additionalInfo += ` (Contrast: ${contrastData[0]}, Colors: ${contrastData[1]} on ${contrastData[2]})`
                                }
                                
                                csvRows.push([
                                    ruleId,
                                    category.toUpperCase(),
                                    category === 'error' ? 'Critical' : 'Serious',
                                    rule.description || ruleId,
                                    elementInfo,
                                    xpath,
                                    selector,
                                    additionalInfo,
                                    `https://wave.webaim.org/help#${ruleId}`
                                ])
                            })
                        }
                    }
                }
            }

            // Results directory already created at the beginning of function
            const resultsDir = path.join(process.cwd(), 'results')

            // Generate filenames based on URL
            const csvFilename = generateFilename(url, 'csv')
            const jsonFilename = generateFilename(url, 'json')

            // Save results to CSV file
            const csvPath = path.join(resultsDir, csvFilename)
            const headers = [
                'Rule ID',
                'Category',
                'Impact',
                'Description',
                'Element',
                'XPath',
                'Selector',
                'Additional Info',
                'Help URL'
            ]
            const csvHeader = headers.map(escapeCSV).join(',') + '\n'

            // Create CSV content
            const metadataSection = generateMetadataSection(metadata)
            const csvContent = metadataSection + csvHeader + csvRows.map(row => row.map(escapeCSV).join(',')).join('\n')
            fs.writeFileSync(csvPath, csvContent)
            console.log(`Accessibility test results saved to: ${csvPath}`)

            // Also save a detailed JSON report
            const jsonPath = path.join(resultsDir, jsonFilename)
            const jsonReport = {
                metadata,
                waveResults: accessibilityScanResults.violations,
                summary: {
                    total: csvRows.length,
                    categories: Object.keys(accessibilityScanResults.violations).filter(key => {
                        const category = accessibilityScanResults.violations[key as keyof WaveReport]
                        return category && category.count > 0
                    })
                }
            }
            fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2))
            console.log(`Detailed JSON report saved to: ${jsonPath}`)

            // Print summary to console
            console.log('\nAccessibility Test Summary:')
            console.log(`Total issues found: ${csvRows.length}`)

            // Count by category
            const categoryCounts = csvRows.reduce(
                (acc, row) => {
                    const category = row[1] // Category is at index 1
                    acc[category] = (acc[category] || 0) + 1
                    return acc
                },
                {} as Record<string, number>
            )
            console.log('\nIssues by category:')
            Object.entries(categoryCounts).forEach(([category, count]) => {
                console.log(`${category}: ${count}`)
            })

            // Count by impact
            const impactCounts = csvRows.reduce(
                (acc, row) => {
                    const impact = row[2] // Impact is at index 2
                    acc[impact] = (acc[impact] || 0) + 1
                    return acc
                },
                {} as Record<string, number>
            )
            console.log('\nIssues by impact:')
            Object.entries(impactCounts).forEach(([impact, count]) => {
                console.log(`${impact}: ${count}`)
            })

            // Count unique rules
            const uniqueRules = [...new Set(csvRows.map(row => row[0]))]
            console.log(`\nUnique rules failed: ${uniqueRules.length}`)

            console.log(`\n✅ Analysis completed successfully for ${url}`);
            console.log(`📁 Results saved to: ${resultsDir}`);

            return {
                csvRows,
                summary: {
                    issueCount: csvRows.length,
                    uniqueRules: uniqueRules.length,
                    categories: categoryCounts
                },
            }
        } finally {
            // Close only the page, not the entire browser
            //      await page.close();
        }
    } catch (error) {
        console.error('Error running accessibility test:', error)
        console.error('Skipping this URL:', url)
        
        // Still try to create an error report
        try {
            const resultsDir = path.join(process.cwd(), 'results')
            const errorFilename = generateFilename(url, 'error.json')
            const errorPath = path.join(resultsDir, errorFilename)
            
            const errorReport = {
                url: url,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            }
            
            fs.writeFileSync(errorPath, JSON.stringify(errorReport, null, 2))
            console.log(`Error report saved to: ${errorPath}`)
        } catch (reportError) {
            console.error('Failed to save error report:', reportError)
        }
    }
}

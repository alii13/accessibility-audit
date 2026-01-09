const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class WaveStandaloneAnalyzer {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.waveScript = null;
        
        this.config = {
            headless: true,
            timeout: 30000,
            waitForSelector: 'body',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            waveScriptPath: path.join(__dirname, 'wave.min.js'),
            retryDelay: 100,
            maxWaveInitRetries: 50,
            ...options
        };
        
        this._validateConfig();
    }

    _validateConfig() {
        if (!fs.existsSync(this.config.waveScriptPath)) {
            throw new Error(`WAVE script not found at: ${this.config.waveScriptPath}`);
        }
    }

    async initialize() {
        console.log('🚀 Initializing WAVE Standalone Analyzer...');
        
        await this._initializeBrowser();
        await this._loadWaveScript();
        
        console.log('✅ Analyzer ready');
    }

    async _initializeBrowser() {
        const launchOptions = {
            headless: this.config.headless,
            args: [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-blink-features=AutomationControlled'
            ]
        };

        this.browser = await chromium.launch(launchOptions);
        this.page = await this.browser.newPage({
            userAgent: this.config.userAgent
        });

        // Set common page configurations
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });
    }

    async _loadWaveScript() {
        if (!this.waveScript) {
            console.log('📄 Loading WAVE script...');
            this.waveScript = fs.readFileSync(this.config.waveScriptPath, 'utf8');
            console.log('✅ WAVE script loaded');
        }
    }

    async analyzeUrl(url) {
        console.log(`📄 Analyzing: ${url}`);
        
        try {
            await this._navigateToPage(url);
            const pageInfo = await this._extractPageInfo();
            const analysisResult = await this._runWaveAnalysis();
            
            const report = this._createReport(pageInfo, analysisResult);
            
            console.log('✅ Analysis complete');
            return report;

        } catch (error) {
            console.error(`❌ Error analyzing ${url}:`, error.message);
            throw new Error(`Failed to analyze ${url}: ${error.message}`);
        }
    }

    async _navigateToPage(url) {
        await this.page.goto(url, { 
            waitUntil: 'networkidle',
            timeout: this.config.timeout 
        });
        
        await this.page.waitForSelector(this.config.waitForSelector, { 
            timeout: this.config.timeout 
        });
    }

    async _extractPageInfo() {
        return await this.page.evaluate(() => ({
            title: document.title || 'Untitled',
            url: window.location.href,
            domain: window.location.hostname,
            protocol: window.location.protocol,
            pathname: window.location.pathname
        }));
    }

    _createReport(pageInfo, analysisResult) {
        return {
            metadata: {
                url: pageInfo.url,
                domain: pageInfo.domain,
                pageTitle: pageInfo.title,
                timestamp: new Date().toISOString(),
                tool: 'WAVE Standalone Analyzer',
                version: '1.0.0',
                userAgent: this.config.userAgent,
                protocol: pageInfo.protocol,
                pathname: pageInfo.pathname
            },
            analysis: analysisResult,
            summary: this._calculateSummary(analysisResult)
        };
    }

    async _runWaveAnalysis() {
        console.log('🔍 Running WAVE analysis...');
        
        const analysisResult = await this.page.evaluate(
            this._getWaveAnalysisScript(),
            {
                waveScript: this.waveScript,
                retryDelay: this.config.retryDelay,
                maxRetries: this.config.maxWaveInitRetries
            }
        );

        console.log('✅ WAVE analysis complete');
        return analysisResult;
    }

    _getWaveAnalysisScript() {
        return (config) => {
            return new Promise((resolve, reject) => {
                try {
                    // Set up WAVE configuration
                    window.waveconfig = {
                        debug: false,
                        extensionUrl: "",
                        platform: "standalone",
                        browser: "chrome"
                    };

                    // Inject WAVE script
                    const scriptElement = document.createElement('script');
                    scriptElement.textContent = config.waveScript;
                    document.head.appendChild(scriptElement);

                    // Function to enhance WAVE results with better DOM information
                    function enhanceResultsWithDOMInfo(results) {
                        function getElementInfo(xpath) {
                            try {
                                const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                                if (!element) return null;
                                
                                return {
                                    tagName: element.tagName,
                                    id: element.id || null,
                                    className: element.className || null,
                                    textContent: element.textContent ? element.textContent.trim().substring(0, 100) : null,
                                    innerHTML: element.innerHTML ? element.innerHTML.substring(0, 200) : null,
                                    attributes: Array.from(element.attributes || []).reduce((acc, attr) => {
                                        acc[attr.name] = attr.value;
                                        return acc;
                                    }, {}),
                                    selector: generateSelector(element)
                                };
                            } catch (error) {
                                return { error: error.message };
                            }
                        }
                        
                        function generateSelector(element) {
                            if (element.id) return `#${element.id}`;
                            if (element.className) {
                                const classes = element.className.trim().split(/\s+/).slice(0, 2).join('.');
                                return `.${classes}`;
                            }
                            return element.tagName.toLowerCase();
                        }
                        
                        const enhanced = JSON.parse(JSON.stringify(results));
                        
                        // Filter to only include error and contrast categories
                        const filteredCategories = {};
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
                                        const uniqueXPaths = [...new Set(item.xpaths)];
                                        item.xpaths = uniqueXPaths;
                                        
                                        // Update count to reflect actual unique instances
                                        item.count = uniqueXPaths.length;
                                        
                                        // Get DOM info for unique XPaths only
                                        item.domInfo = uniqueXPaths.map(xpath => getElementInfo(xpath)).filter(info => info !== null);
                                        
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
                                category.count = Object.values(category.items).reduce((total, item) => total + (item.count || 0), 0);
                            }
                        });
                        
                        // Return only filtered categories
                        enhanced.categories = filteredCategories;
                        return enhanced;
                    }

                    // Wait for WAVE to initialize with retry logic
                    let attempts = 0;
                    const checkWaveAvailability = () => {
                        attempts++;
                        
                        if (typeof window.wave !== 'undefined' && window.wave.fn) {
                            try {
                                // Initialize and run WAVE
                                window.wave.fn.initialize();
                                
                                window.wave.fn.run()
                                    .then(results => {
                                        // Enhance results with better DOM information
                                        const enhancedResults = enhanceResultsWithDOMInfo(results);
                                        
                                        resolve({
                                            success: true,
                                            categories: enhancedResults.categories || {},
                                            statistics: enhancedResults.statistics || {},
                                            timestamp: new Date().toISOString(),
                                            attempts: attempts
                                        });
                                    })
                                    .catch(error => {
                                        reject(new Error(`WAVE analysis execution failed: ${error.message}`));
                                    });
                            } catch (error) {
                                reject(new Error(`WAVE initialization failed: ${error.message}`));
                            }
                        } else if (attempts >= config.maxRetries) {
                            reject(new Error(`WAVE failed to initialize after ${config.maxRetries} attempts`));
                        } else {
                            // Retry after delay
                            setTimeout(checkWaveAvailability, config.retryDelay);
                        }
                    };

                    checkWaveAvailability();

                } catch (error) {
                    reject(new Error(`Script injection failed: ${error.message}`));
                }
            });
        };
    }

    _calculateSummary(analysisResult) {
        const summary = {
            totalIssues: 0,
            errors: 0,
            contrastErrors: 0,
            categories: {},
            success: analysisResult.success || false,
            analysisTime: analysisResult.timestamp
        };

        if (!analysisResult.success || !analysisResult.categories) {
            return summary;
        }

        // Process error category
        if (analysisResult.categories.error && this._isValidCategoryData(analysisResult.categories.error)) {
            const errorData = analysisResult.categories.error;
            summary.categories.error = {
                count: errorData.count,
                items: Object.keys(errorData.items || {}).length,
                description: this._getCategoryDescription('error')
            };
            
            summary.errors = errorData.count;
            summary.totalIssues += errorData.count;
        }

        // Process contrast category
        if (analysisResult.categories.contrast && this._isValidCategoryData(analysisResult.categories.contrast)) {
            const contrastData = analysisResult.categories.contrast;
            summary.categories.contrast = {
                count: contrastData.count,
                items: Object.keys(contrastData.items || {}).length,
                description: this._getCategoryDescription('contrast')
            };
            
            summary.contrastErrors = contrastData.count;
            summary.totalIssues += contrastData.count;
        }

        return summary;
    }

    _isValidCategoryData(categoryData) {
        return categoryData && 
               typeof categoryData.count === 'number' && 
               categoryData.count >= 0;
    }

    _updateSummaryCounters(summary, categoryName, count) {
        summary.totalIssues += count;
        
        const categoryMap = {
            'error': 'errors',
            'alert': 'alerts', 
            'feature': 'features',
            'structure': 'structuralElements',
            'aria': 'ariaElements',
            'contrast': 'contrastErrors'
        };

        const summaryField = categoryMap[categoryName];
        if (summaryField) {
            summary[summaryField] = count;
        }
    }

    _getCategoryDescription(categoryName) {
        const descriptions = {
            'error': 'Accessibility errors that must be fixed',
            'alert': 'Items that need manual review',
            'feature': 'Accessibility features detected',
            'structure': 'Structural elements found',
            'aria': 'ARIA elements and attributes',
            'contrast': 'Color contrast issues'
        };
        
        return descriptions[categoryName] || 'Unknown category';
    }

    async saveReport(report, outputFile) {
        const jsonString = JSON.stringify(report, null, 2);
        
        // Ensure directory exists
        const dir = path.dirname(outputFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(outputFile, jsonString);
        console.log(`💾 Report saved to: ${outputFile}`);
    }

    async analyzeBatch(urls, options = {}) {
        const config = {
            outputDir: './reports',
            delay: 1000,
            maxRetries: 2,
            saveIndividualReports: true,
            ...options
        };

        console.log(`📊 Starting batch analysis of ${urls.length} URLs`);
        this._ensureDirectoryExists(config.outputDir);
        
        const results = [];
        const startTime = Date.now();
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const result = await this._processUrlWithRetry(url, i + 1, urls.length, config);
            results.push(result);
            
            // Add delay between URLs (except for the last one)
            if (i < urls.length - 1 && config.delay > 0) {
                await this._delay(config.delay);
            }
        }

        const batchSummary = this._createBatchSummary(results, urls.length, startTime);
        await this._saveBatchSummary(batchSummary, config.outputDir);

        return results;
    }

    async _processUrlWithRetry(url, current, total, config) {
        let attempt = 0;
        
        while (attempt < config.maxRetries) {
            try {
                const report = await this.analyzeUrl(url);
                
                if (config.saveIndividualReports) {
                    await this._saveIndividualReport(report, url, config.outputDir);
                }
                
                console.log(`✅ ${current}/${total} - ${url} (attempt ${attempt + 1})`);
                return { 
                    url, 
                    success: true, 
                    report, 
                    attempts: attempt + 1,
                    duration: report.analysis.timestamp 
                };
                
            } catch (error) {
                attempt++;
                console.error(`❌ ${current}/${total} - ${url} - Attempt ${attempt} failed:`, error.message);
                
                if (attempt >= config.maxRetries) {
                    return { 
                        url, 
                        success: false, 
                        error: error.message, 
                        attempts: attempt 
                    };
                } else {
                    console.log(`🔄 Retrying ${url} (attempt ${attempt + 1}/${config.maxRetries})`);
                    await this._delay(config.delay);
                }
            }
        }
    }

    async _saveIndividualReport(report, url, outputDir) {
        const sanitizedUrl = this._sanitizeFilename(url);
        const timestamp = new Date().toISOString().split('T')[0];
        const outputFile = path.join(outputDir, `${sanitizedUrl}_${timestamp}.json`);
        await this.saveReport(report, outputFile);
    }

    _createBatchSummary(results, totalUrls, startTime) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        return {
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            totalUrls,
            successful: successful.length,
            failed: failed.length,
            successRate: ((successful.length / totalUrls) * 100).toFixed(1) + '%',
            results: results.map(r => ({
                url: r.url,
                success: r.success,
                attempts: r.attempts,
                error: r.error || null,
                summary: r.report ? r.report.summary : null
            })),
            aggregatedStats: this._calculateAggregatedStats(successful)
        };
    }

    _calculateAggregatedStats(successfulResults) {
        if (successfulResults.length === 0) return null;
        
        const stats = {
            totalErrors: 0,
            totalContrastErrors: 0,
            averageErrors: 0,
            averageContrastErrors: 0,
            issueTypes: {}
        };

        successfulResults.forEach(result => {
            const summary = result.report.summary;
            stats.totalErrors += summary.errors;
            stats.totalContrastErrors += summary.contrastErrors;
            
            // Collect error types
            if (result.report.analysis.categories.error && result.report.analysis.categories.error.items) {
                Object.entries(result.report.analysis.categories.error.items).forEach(([key, item]) => {
                    stats.issueTypes[item.description] = (stats.issueTypes[item.description] || 0) + item.count;
                });
            }
            
            // Collect contrast error types
            if (result.report.analysis.categories.contrast && result.report.analysis.categories.contrast.items) {
                Object.entries(result.report.analysis.categories.contrast.items).forEach(([key, item]) => {
                    stats.issueTypes[item.description] = (stats.issueTypes[item.description] || 0) + item.count;
                });
            }
        });

        const count = successfulResults.length;
        stats.averageErrors = (stats.totalErrors / count).toFixed(1);
        stats.averageContrastErrors = (stats.totalContrastErrors / count).toFixed(1);

        return stats;
    }

    async _saveBatchSummary(batchSummary, outputDir) {
        const summaryFile = path.join(outputDir, `batch_summary_${new Date().toISOString().split('T')[0]}.json`);
        await this.saveReport(batchSummary, summaryFile);
        console.log(`📋 Batch summary saved to: ${summaryFile}`);
    }

    _sanitizeFilename(url) {
        return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
    }

    _ensureDirectoryExists(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        console.log('🧹 Cleaning up...');
        
        try {
            if (this.page && !this.page.isClosed()) {
                await this.page.close();
            }
        } catch (error) {
            console.warn('Warning: Error closing page:', error.message);
        }
        
        try {
            if (this.browser && this.browser.isConnected()) {
                await this.browser.close();
            }
        } catch (error) {
            console.warn('Warning: Error closing browser:', error.message);
        }
        
        this.page = null;
        this.browser = null;
        this.waveScript = null;
        
        console.log('✅ Cleanup complete');
    }

    // Utility methods
    isInitialized() {
        return this.browser && this.page && this.waveScript;
    }

    async getPageInfo() {
        if (!this.page) {
            throw new Error('Analyzer not initialized');
        }
        
        return await this._extractPageInfo();
    }

    getConfig() {
        return { ...this.config };
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._validateConfig();
    }
}

module.exports = WaveStandaloneAnalyzer;

// CLI usage when run directly
if (require.main === module) {
    const analyzer = new WaveStandaloneAnalyzer({ headless: false });
    
    const url = process.argv[2];
    
    if (!url) {
        console.log('📋 Usage: node analyzer.js <URL>');
        console.log('📋 Example: node analyzer.js https://example.com');
        process.exit(1);
    }

    analyzer.initialize()
        .then(() => analyzer.analyzeUrl(url))
        .then(report => {
            console.log('\n📊 Analysis Summary:');
            console.log(`  Page: ${report.metadata.pageTitle}`);
            console.log(`  Errors: ${report.summary.errors}`);
            console.log(`  Alerts: ${report.summary.alerts}`);
            console.log(`  Features: ${report.summary.features}`);
            console.log(`  Structural Elements: ${report.summary.structuralElements}`);
            console.log(`  ARIA Elements: ${report.summary.ariaElements}`);
            console.log(`  Total Issues: ${report.summary.totalIssues}`);
            
            // Save report
            const filename = `wave_report_${url.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
            return analyzer.saveReport(report, filename);
        })
        .catch(error => {
            console.error('❌ Analysis failed:', error.message);
            process.exit(1);
        })
        .finally(() => {
            analyzer.close();
        });
} 
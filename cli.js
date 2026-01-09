#!/usr/bin/env node

const WaveStandaloneAnalyzer = require('./analyzer');
const fs = require('fs');
const path = require('path');

class WaveCLI {
    constructor() {
        this.config = {
            headless: true,
            timeout: 30000,
            delay: 1000,
            maxRetries: 2,
            outputFile: null,
            outputDir: './reports',
            batchFile: null,
            url: null,
            verbose: false
        };
    }

    printUsage() {
        console.log(`
🌊 WAVE Standalone Analyzer CLI

USAGE:
  node cli.js [options] <url>
  node cli.js [options] --batch <file>

OPTIONS:
  -h, --help           Show this help message
  -o, --output <file>  Output file for single URL analysis
  -d, --dir <dir>      Output directory for batch analysis (default: ./reports)
  --headless           Run in headless mode (default: true)
  --no-headless        Run with visible browser
  --timeout <ms>       Timeout in milliseconds (default: 30000)
  --delay <ms>         Delay between batch requests in ms (default: 1000)
  --retries <num>      Max retries for failed requests (default: 2)
  --verbose            Enable verbose logging

EXAMPLES:
  Single URL analysis:
    node cli.js https://example.com
    node cli.js -o report.json https://example.com
    node cli.js --no-headless https://example.com

  Batch analysis:
    node cli.js --batch urls.txt
    node cli.js --batch urls.txt -d ./my-reports
    
  Batch with options:
    node cli.js --batch urls.txt --delay 2000 --retries 3 --verbose

BATCH FILE FORMAT:
  Create a text file with one URL per line:
  https://example.com
  https://google.com
  https://github.com
  # Comments start with #
        `);
    }

    parseArguments(args) {
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            switch (arg) {
                case '-h':
                case '--help':
                    this.printUsage();
                    process.exit(0);
                    break;
                case '-o':
                case '--output':
                    this.config.outputFile = args[++i];
                    break;
                case '-d':
                case '--dir':
                    this.config.outputDir = args[++i];
                    break;
                case '--headless':
                    this.config.headless = true;
                    break;
                case '--no-headless':
                    this.config.headless = false;
                    break;
                case '--timeout':
                    this.config.timeout = this.parseInteger(args[++i], 'timeout');
                    break;
                case '--delay':
                    this.config.delay = this.parseInteger(args[++i], 'delay');
                    break;
                case '--retries':
                    this.config.maxRetries = this.parseInteger(args[++i], 'retries');
                    break;
                case '--batch':
                    this.config.batchFile = args[++i];
                    break;
                case '--verbose':
                    this.config.verbose = true;
                    break;
                default:
                    if (arg.startsWith('http')) {
                        this.config.url = arg;
                    }
                    break;
            }
        }
    }

    parseInteger(value, name) {
        const parsed = parseInt(value);
        if (isNaN(parsed) || parsed < 0) {
            throw new Error(`Invalid ${name} value: ${value}`);
        }
        return parsed;
    }

    validateConfig() {
        if (!this.config.batchFile && !this.config.url) {
            throw new Error('Please provide a URL or use --batch with a file');
        }

        if (this.config.batchFile && !fs.existsSync(this.config.batchFile)) {
            throw new Error(`Batch file not found: ${this.config.batchFile}`);
        }

        if (this.config.url) {
            try {
                new URL(this.config.url);
            } catch (error) {
                throw new Error(`Invalid URL: ${this.config.url}`);
            }
        }

        // Ensure output directory exists
        const outputDir = this.config.outputDir || path.dirname(this.config.outputFile || './reports');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    }

    loadUrlsFromFile(filePath) {
        this.log(`📂 Reading URLs from: ${filePath}`);
        const urlsContent = fs.readFileSync(filePath, 'utf8');
        const urls = urlsContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && line.startsWith('http'));

        if (urls.length === 0) {
            throw new Error('No valid URLs found in batch file');
        }

        this.log(`📊 Found ${urls.length} URLs to analyze`);
        return urls;
    }

    async runSingleAnalysis() {
        const analyzer = new WaveStandaloneAnalyzer({
            headless: this.config.headless,
            timeout: this.config.timeout
        });

        try {
            await analyzer.initialize();
            const report = await analyzer.analyzeUrl(this.config.url);
            
            this.printSingleSummary(report);
            
            const outputFile = this.config.outputFile || 
                `wave_report_${this.config.url.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            
            await analyzer.saveReport(report, outputFile);
            console.log(`\n💾 Full report saved to: ${outputFile}`);
            
        } finally {
            await analyzer.close();
        }
    }

    async runBatchAnalysis() {
        const urls = this.loadUrlsFromFile(this.config.batchFile);
        
        const analyzer = new WaveStandaloneAnalyzer({
            headless: this.config.headless,
            timeout: this.config.timeout
        });

        try {
            await analyzer.initialize();
            
            const results = await analyzer.analyzeBatch(urls, {
                outputDir: this.config.outputDir,
                delay: this.config.delay,
                maxRetries: this.config.maxRetries
            });

            this.printBatchSummary(results);
            
        } finally {
            await analyzer.close();
        }
    }

    printSingleSummary(report) {
        console.log('\n📊 Analysis Summary:');
        console.log(`  🌐 URL: ${report.metadata.url}`);
        console.log(`  📄 Page: ${report.metadata.pageTitle}`);
        console.log(`  ❌ Errors: ${report.summary.errors}`);
        console.log(`  🎨 Contrast Errors: ${report.summary.contrastErrors}`);
        console.log(`  📊 Total Issues: ${report.summary.totalIssues}`);
        
        // Show specific error details if available
        if (report.analysis.categories.error && report.analysis.categories.error.items) {
            console.log(`\n🔍 Error Details:`);
            Object.entries(report.analysis.categories.error.items).forEach(([key, item]) => {
                console.log(`  - ${item.description}: ${item.count} instances`);
            });
        }

        // Show contrast error details if available
        if (report.analysis.categories.contrast && report.analysis.categories.contrast.items) {
            console.log(`\n🎨 Contrast Error Details:`);
            Object.entries(report.analysis.categories.contrast.items).forEach(([key, item]) => {
                console.log(`  - ${item.description}: ${item.count} instances`);
            });
        }
    }

    printBatchSummary(results) {
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log('\n📊 Batch Analysis Complete:');
        console.log(`  ✅ Successful: ${successful}`);
        console.log(`  ❌ Failed: ${failed}`);
        console.log(`  📁 Reports saved to: ${this.config.outputDir}`);

        if (failed > 0) {
            console.log('\n❌ Failed URLs:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`  ${r.url} - ${r.error}`);
            });
        }

        // Show aggregated error stats if available
        if (successful > 0) {
            const totalErrors = results.filter(r => r.success).reduce((sum, r) => sum + r.report.summary.errors, 0);
            const totalContrastErrors = results.filter(r => r.success).reduce((sum, r) => sum + r.report.summary.contrastErrors, 0);
            const avgErrors = (totalErrors / successful).toFixed(1);
            const avgContrastErrors = (totalContrastErrors / successful).toFixed(1);
            
            console.log('\n📈 Error Statistics:');
            console.log(`  📊 Total Errors: ${totalErrors} (avg: ${avgErrors} per page)`);
            console.log(`  🎨 Total Contrast Errors: ${totalContrastErrors} (avg: ${avgContrastErrors} per page)`);
            
            // Show most common error types
            const errorTypes = {};
            results.filter(r => r.success).forEach(r => {
                if (r.report.analysis.categories.error && r.report.analysis.categories.error.items) {
                    Object.entries(r.report.analysis.categories.error.items).forEach(([key, item]) => {
                        errorTypes[item.description] = (errorTypes[item.description] || 0) + item.count;
                    });
                }
                if (r.report.analysis.categories.contrast && r.report.analysis.categories.contrast.items) {
                    Object.entries(r.report.analysis.categories.contrast.items).forEach(([key, item]) => {
                        errorTypes[item.description] = (errorTypes[item.description] || 0) + item.count;
                    });
                }
            });
            
            if (Object.keys(errorTypes).length > 0) {
                console.log('\n🔍 Most Common Issue Types:');
                Object.entries(errorTypes)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .forEach(([type, count]) => {
                        console.log(`  - ${type}: ${count} instances`);
                    });
            }
        }
    }

    log(message) {
        if (this.config.verbose) {
            console.log(message);
        }
    }

    async run() {
        try {
            const args = process.argv.slice(2);
            
            if (args.length === 0) {
                this.printUsage();
                return;
            }
            
            this.parseArguments(args);
            this.validateConfig();
            
            if (this.config.verbose) {
                console.log('🔧 Configuration:', JSON.stringify(this.config, null, 2));
            }
            
            if (this.config.batchFile) {
                await this.runBatchAnalysis();
            } else {
                await this.runSingleAnalysis();
            }
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new WaveCLI();
    cli.run().catch(error => {
        console.error('❌ Unexpected error:', error.message);
        process.exit(1);
    });
}

module.exports = WaveCLI; 
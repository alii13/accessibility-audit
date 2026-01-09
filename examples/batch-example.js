const WaveStandaloneAnalyzer = require('../analyzer');
const path = require('path');

async function runExample() {
    console.log('🌊 WAVE Standalone Analyzer - Programmatic Example');
    
    // Create analyzer instance
    const analyzer = new WaveStandaloneAnalyzer({
        headless: true,  // Set to false to see the browser
        timeout: 30000
    });

    try {
        // Initialize the analyzer
        await analyzer.initialize();

        // Example 1: Single URL analysis
        console.log('\n📄 Example 1: Single URL Analysis');
        const singleReport = await analyzer.analyzeUrl('https://example.com');
        
        console.log('Analysis Results:');
        console.log(`  Page Title: ${singleReport.metadata.pageTitle}`);
        console.log(`  Errors: ${singleReport.summary.errors}`);
        console.log(`  Alerts: ${singleReport.summary.alerts}`);
        console.log(`  Features: ${singleReport.summary.features}`);
        
        // Save the report
        await analyzer.saveReport(singleReport, './reports/example-single.json');

        // Example 2: Batch analysis
        console.log('\n📊 Example 2: Batch Analysis');
        const urls = [
            'https://example.com',
            'https://httpbin.org/html',
            'https://google.com'
        ];

        const batchResults = await analyzer.analyzeBatch(urls, {
            outputDir: './reports/batch-example',
            delay: 2000,  // 2 second delay between requests
            maxRetries: 2
        });

        // Print batch summary
        const successful = batchResults.filter(r => r.success).length;
        const failed = batchResults.filter(r => !r.success).length;
        
        console.log('\nBatch Results:');
        console.log(`  ✅ Successful: ${successful}`);
        console.log(`  ❌ Failed: ${failed}`);

        // Example 3: Custom analysis with error handling
        console.log('\n🔧 Example 3: Error Handling');
        try {
            await analyzer.analyzeUrl('https://this-domain-does-not-exist-12345.com');
        } catch (error) {
            console.log(`  Handled error gracefully: ${error.message}`);
        }

        console.log('\n✅ All examples completed successfully!');

    } catch (error) {
        console.error('❌ Example failed:', error.message);
    } finally {
        // Always close the browser
        await analyzer.close();
    }
}

// Export for use in other scripts
module.exports = { runExample };

// Run if this file is executed directly
if (require.main === module) {
    runExample().catch(console.error);
} 
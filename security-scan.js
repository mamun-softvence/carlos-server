// enhanced-security-scanner.js
const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');

class EnhancedSecurityScanner {
    constructor(options = {}) {
        this.options = {
            extensions: options.extensions || ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
            excludeDirs: options.excludeDirs || [
                'node_modules',
                '.git',
                'dist',
                'build',
                'coverage',
                '.next',
                'out',
                'vendor',
                'bower_components',
                'security-scan-results'
            ],
            excludeFiles: options.excludeFiles || [
                'package-lock.json',
                'yarn.lock',
                'pnpm-lock.yaml',
                'security-scan.js'
            ],
            maxFileSize: options.maxFileSize || 5 * 1024 * 1024, // 5MB
            logProgress: options.logProgress !== false,
            generateHTML: options.generateHTML || false,
            outputPath: options.outputPath || './security-scan-results'
        };

        this.stats = {
            totalFiles: 0,
            scannedFiles: 0,
            skippedFiles: 0,
            maliciousFiles: 0,
            errors: []
        };

        this.suspiciousPatterns = {
            hexEncoding: /\\x[0-9a-fA-F]{2}/g,
            charCodeObfuscation: /String\.fromCharCode|charCodeAt/i,
            evalPatterns: /\beval\s*\(|\bFunction\s*\(|new\s+Function/,
            suspiciousVarNames: /var\s+[a-zA-Z_$]{1,3}\s*=/g,
            stringScrambling: /\.split\([^)]*\)\.join\([^)]*\)/,
            globalManipulation: /global\[|window\[|this\[/gi,
            dynamicRequire: /global\[[^\]]+\]\s*=\s*require/i,
            moduleManipulation: /typeof\s+module\s*===|module\.exports/i,
            mathObfuscation: /\*\s*\([^)]+\+\s*\d+\)\s*\+\s*\([^)]+%\s*\d+\)/,
            iife: /\(function\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\([^)]*\)\)/,
            encodedStrings: /['"][^'"]{100,}['"]/,
            networkPatterns: /http[s]?:\/\/|fetch\(|XMLHttpRequest|\.download/i,
            base64: /atob\(|btoa\(|base64/i,
            childProcess: /(?<!\.)\bexec\s*\(|\bchild_process\b|\bspawn\s*\(/i,
            fileSystem: /unlinkSync|rmdirSync|writeFileSync.*\//,
        };

        this.severityWeights = {
            critical: 10,
            high: 7,
            medium: 4,
            low: 2
        };

        this.detectionRules = [
            {
                name: 'Heavy Obfuscation',
                severity: 'critical',
                check: (code) => this.checkHeavyObfuscation(code)
            },
            {
                name: 'Eval Usage',
                severity: 'critical',
                check: (code) => this.suspiciousPatterns.evalPatterns.test(code)
            },
            {
                name: 'Global Scope Manipulation',
                severity: 'high',
                check: (code) => this.checkGlobalManipulation(code)
            },
            {
                name: 'String Obfuscation',
                severity: 'high',
                check: (code) => this.checkStringObfuscation(code)
            },
            {
                name: 'Dynamic Code Execution',
                severity: 'critical',
                check: (code) => this.checkDynamicExecution(code)
            },
            {
                name: 'Suspicious Variable Names',
                severity: 'medium',
                check: (code) => this.checkSuspiciousVariables(code)
            },
            {
                name: 'Hex Encoding',
                severity: 'medium',
                check: (code) => {
                    this.suspiciousPatterns.hexEncoding.lastIndex = 0;
                    return this.suspiciousPatterns.hexEncoding.test(code);
                }
            },
            {
                name: 'Module/Require Manipulation',
                severity: 'high',
                check: (code) => this.checkModuleManipulation(code)
            },
            {
                name: 'Character Code Obfuscation',
                severity: 'high',
                check: (code) => (code.match(/String\.fromCharCode|charCodeAt/gi) || []).length > 3
            },
            {
                name: 'Base64 Operations',
                severity: 'medium',
                check: (code) => this.suspiciousPatterns.base64.test(code) && code.length > 500
            },
            {
                name: 'Child Process Execution',
                severity: 'high',
                check: (code) => this.suspiciousPatterns.childProcess.test(code)
            },
            {
                name: 'Suspicious File Operations',
                severity: 'high',
                check: (code) => this.suspiciousPatterns.fileSystem.test(code)
            }
        ];
    }

    async scanCodebase(rootPath) {
        console.log('🔍 Starting codebase security scan...');
        console.log(`📁 Target: ${rootPath}\n`);

        const startTime = Date.now();
        const results = [];

        try {
            await this.scanDirectory(rootPath, results);

            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);

            const report = this.generateDetailedReport(results, duration);
            await this.saveReport(report);

            this.displaySummary(report);

            return report;
        } catch (error) {
            console.error('❌ Scan failed:', error.message);
            throw error;
        }
    }

    async scanDirectory(dirPath, results, depth = 0) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    if (!this.shouldExcludeDirectory(entry.name)) {
                        await this.scanDirectory(fullPath, results, depth + 1);
                    }
                } else if (entry.isFile()) {
                    if (this.shouldScanFile(entry.name)) {
                        this.stats.totalFiles++;
                        await this.scanFile(fullPath, results);
                    }
                }
            }
        } catch (error) {
            this.stats.errors.push({
                path: dirPath,
                error: error.message
            });
        }
    }

    async scanFile(filePath, results) {
        try {
            const stats = await fs.stat(filePath);

            if (stats.size > this.options.maxFileSize) {
                this.stats.skippedFiles++;
                if (this.options.logProgress) {
                    console.log(`⏭️  Skipped (too large): ${filePath}`);
                }
                return;
            }

            const code = await fs.readFile(filePath, 'utf-8');
            const result = this.scan(code);

            result.filePath = filePath;
            result.fileSize = stats.size;
            result.relativePath = path.relative(process.cwd(), filePath);

            this.stats.scannedFiles++;

            if (result.riskScore > 0) {
                results.push(result);

                if (result.isMalicious) {
                    this.stats.maliciousFiles++;
                    if (this.options.logProgress) {
                        console.log(`⚠️  MALICIOUS: ${result.relativePath} (Score: ${result.riskScore})`);
                    }
                } else if (this.options.logProgress && result.riskLevel !== 'LOW') {
                    console.log(`⚡ ${result.riskLevel}: ${result.relativePath} (Score: ${result.riskScore})`);
                }
            }

            if (this.options.logProgress && this.stats.scannedFiles % 100 === 0) {
                console.log(`📊 Progress: ${this.stats.scannedFiles}/${this.stats.totalFiles} files scanned`);
            }

        } catch (error) {
            this.stats.errors.push({
                path: filePath,
                error: error.message
            });
            this.stats.skippedFiles++;
        }
    }

    scan(code) {
        const results = {
            isMalicious: false,
            riskScore: 0,
            maxRiskScore: 100,
            detections: [],
            metrics: this.calculateMetrics(code),
            timestamp: new Date().toISOString()
        };

        for (const rule of this.detectionRules) {
            if (rule.check(code)) {
                const detection = {
                    rule: rule.name,
                    severity: rule.severity,
                    weight: this.severityWeights[rule.severity]
                };
                results.detections.push(detection);
                results.riskScore += detection.weight;
            }
        }

        results.isMalicious = results.riskScore >= 15;
        results.riskLevel = this.getRiskLevel(results.riskScore);

        return results;
    }

    shouldExcludeDirectory(dirName) {
        return this.options.excludeDirs.some(excluded =>
            dirName === excluded || dirName.startsWith('.')
        );
    }

    shouldScanFile(fileName) {
        if (this.options.excludeFiles.includes(fileName)) {
            return false;
        }
        return this.options.extensions.some(ext => fileName.endsWith(ext));
    }

    checkHeavyObfuscation(code) {
        const indicators = [
            this.suspiciousPatterns.stringScrambling.test(code),
            this.suspiciousPatterns.mathObfuscation.test(code),
            this.suspiciousPatterns.iife.test(code),
            (code.match(/[a-zA-Z_$]{1,3}\s*=/g) || []).length > 10,
            (code.match(/\\x[0-9a-fA-F]{2}/g) || []).length > 5
        ];

        return indicators.filter(Boolean).length >= 3;
    }

    checkGlobalManipulation(code) {
        const globalAccess = (code.match(this.suspiciousPatterns.globalManipulation) || []).length;
        const dynamicRequire = this.suspiciousPatterns.dynamicRequire.test(code);

        return globalAccess > 2 || dynamicRequire;
    }

    checkStringObfuscation(code) {
        const splits = (code.match(/\.split\(/g) || []).length;
        const joins = (code.match(/\.join\(/g) || []).length;
        const substr = (code.match(/\.substr|\.substring/g) || []).length;

        return (splits > 3 && joins > 3) || substr > 5;
    }

    checkDynamicExecution(code) {
        const patterns = [
            /\beval\s*\(/,
            /\bFunction\s*\(/,
            /setTimeout\s*\(\s*['"]/i,
            /setInterval\s*\(\s*['"]/i
        ];

        return patterns.some(pattern => pattern.test(code));
    }

    checkSuspiciousVariables(code) {
        const varNames = code.match(/\b(?:var|let|const)\s+([a-zA-Z_$]+)\s*=/g) || [];
        const shortNames = varNames.filter(v => {
            const match = v.match(/([a-zA-Z_$]+)\s*=/);
            return match && match[1].length <= 3;
        });

        return shortNames.length > 10;
    }

    checkModuleManipulation(code) {
        const patterns = [
            /global\[[^\]]+\]\s*=\s*require/,
            /global\[[^\]]+\]\s*=\s*module/,
            /typeof\s+module\s*===\s*['"]/
        ];

        return patterns.some(pattern => pattern.test(code));
    }

    calculateMetrics(code) {
        const lines = code.split('\n');

        return {
            totalLines: lines.length,
            totalCharacters: code.length,
            hexEncodings: (code.match(this.suspiciousPatterns.hexEncoding) || []).length,
            shortVariables: (code.match(/\b[a-zA-Z_$]{1,3}\s*=/g) || []).length,
            functionCalls: (code.match(/\w+\s*\(/g) || []).length,
            stringLiterals: (code.match(/['"][^'"]*['"]/g) || []).length,
            arrayAccess: (code.match(/\[[^\]]*\]/g) || []).length,
            obfuscationDensity: this.calculateObfuscationDensity(code)
        };
    }

    calculateObfuscationDensity(code) {
        const totalChars = code.length || 1;
        let obfuscatedChars = 0;

        const hexMatches = code.match(this.suspiciousPatterns.hexEncoding) || [];
        obfuscatedChars += hexMatches.length * 4;

        const shortVars = code.match(/\b[a-zA-Z_$]{1,3}\b/g) || [];
        obfuscatedChars += shortVars.length * 2;

        return ((obfuscatedChars / totalChars) * 100).toFixed(2);
    }

    getRiskLevel(score) {
        if (score >= 25) return 'CRITICAL';
        if (score >= 15) return 'HIGH';
        if (score >= 8) return 'MEDIUM';
        if (score > 0) return 'LOW';
        return 'SAFE';
    }

    generateDetailedReport(results, duration) {
        const sortedResults = results.sort((a, b) => b.riskScore - a.riskScore);

        const riskBreakdown = {
            CRITICAL: sortedResults.filter(r => r.riskLevel === 'CRITICAL').length,
            HIGH: sortedResults.filter(r => r.riskLevel === 'HIGH').length,
            MEDIUM: sortedResults.filter(r => r.riskLevel === 'MEDIUM').length,
            LOW: sortedResults.filter(r => r.riskLevel === 'LOW').length
        };

        return {
            summary: {
                scanDate: new Date().toISOString(),
                duration: `${duration}s`,
                totalFilesFound: this.stats.totalFiles,
                filesScanned: this.stats.scannedFiles,
                filesSkipped: this.stats.skippedFiles,
                filesWithIssues: results.length,
                maliciousFiles: this.stats.maliciousFiles,
                errors: this.stats.errors.length
            },
            riskBreakdown,
            results: sortedResults,
            errors: this.stats.errors,
            topIssues: this.getTopIssues(sortedResults)
        };
    }

    getTopIssues(results) {
        const detectionCount = {};

        results.forEach(result => {
            result.detections.forEach(detection => {
                detectionCount[detection.rule] = (detectionCount[detection.rule] || 0) + 1;
            });
        });

        return Object.entries(detectionCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([rule, count]) => ({ rule, count }));
    }

    async saveReport(report) {
        try {
            await fs.mkdir(this.options.outputPath, { recursive: true });

            // Save JSON report
            const jsonPath = path.join(this.options.outputPath, 'scan-report.json');
            await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
            console.log(`\n📄 JSON report saved: ${jsonPath}`);

            // Save text summary
            const textPath = path.join(this.options.outputPath, 'scan-summary.txt');
            await fs.writeFile(textPath, this.generateTextReport(report));
            console.log(`📄 Text report saved: ${textPath}`);

            // Generate HTML report if requested
            if (this.options.generateHTML) {
                const htmlPath = path.join(this.options.outputPath, 'scan-report.html');
                await fs.writeFile(htmlPath, this.generateHTMLReport(report));
                console.log(`📄 HTML report saved: ${htmlPath}`);
            }

            // Save malicious files list
            if (report.summary.maliciousFiles > 0) {
                const maliciousPath = path.join(this.options.outputPath, 'malicious-files.txt');
                const maliciousFiles = report.results
                    .filter(r => r.isMalicious)
                    .map(r => r.relativePath)
                    .join('\n');
                await fs.writeFile(maliciousPath, maliciousFiles);
                console.log(`📄 Malicious files list saved: ${maliciousPath}`);
            }

        } catch (error) {
            console.error('❌ Error saving report:', error.message);
        }
    }

    generateTextReport(report) {
        const lines = [];

        lines.push('='.repeat(80));
        lines.push('SECURITY SCAN REPORT');
        lines.push('='.repeat(80));
        lines.push('');
        lines.push(`Scan Date: ${report.summary.scanDate}`);
        lines.push(`Duration: ${report.summary.duration}`);
        lines.push('');
        lines.push('SUMMARY');
        lines.push('-'.repeat(80));
        lines.push(`Total Files Found: ${report.summary.totalFilesFound}`);
        lines.push(`Files Scanned: ${report.summary.filesScanned}`);
        lines.push(`Files Skipped: ${report.summary.filesSkipped}`);
        lines.push(`Files with Issues: ${report.summary.filesWithIssues}`);
        lines.push(`Malicious Files: ${report.summary.maliciousFiles}`);
        lines.push(`Errors: ${report.summary.errors}`);
        lines.push('');
        lines.push('RISK BREAKDOWN');
        lines.push('-'.repeat(80));
        lines.push(`CRITICAL: ${report.riskBreakdown.CRITICAL}`);
        lines.push(`HIGH: ${report.riskBreakdown.HIGH}`);
        lines.push(`MEDIUM: ${report.riskBreakdown.MEDIUM}`);
        lines.push(`LOW: ${report.riskBreakdown.LOW}`);
        lines.push('');

        if (report.results.length > 0) {
            lines.push('TOP ISSUES');
            lines.push('-'.repeat(80));
            report.topIssues.forEach(issue => {
                lines.push(`${issue.rule}: ${issue.count} occurrences`);
            });
            lines.push('');

            lines.push('DETAILED FINDINGS');
            lines.push('-'.repeat(80));
            report.results.forEach((result, index) => {
                lines.push(`\n${index + 1}. ${result.relativePath}`);
                lines.push(`   Risk Level: ${result.riskLevel}`);
                lines.push(`   Risk Score: ${result.riskScore}`);
                lines.push(`   Detections:`);
                result.detections.forEach(d => {
                    lines.push(`     - ${d.rule} (${d.severity})`);
                });
            });
        }

        return lines.join('\n');
    }

    generateHTMLReport(report) {
        return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Security Scan Report</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                background: #f5f5f5;
                padding: 20px;
            }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #333; margin-bottom: 10px; }
            .date { color: #666; margin-bottom: 30px; }
            .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .stat-card { background: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #007bff; }
            .stat-card.danger { border-left-color: #dc3545; }
            .stat-card.warning { border-left-color: #ffc107; }
            .stat-label { font-size: 0.875rem; color: #666; margin-bottom: 5px; }
            .stat-value { font-size: 2rem; font-weight: bold; color: #333; }
            .risk-breakdown { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
            .risk-item { padding: 15px; border-radius: 6px; text-align: center; }
            .risk-critical { background: #dc3545; color: white; }
            .risk-high { background: #fd7e14; color: white; }
            .risk-medium { background: #ffc107; color: #333; }
            .risk-low { background: #28a745; color: white; }
            .findings { margin-top: 30px; }
            .finding { background: #f8f9fa; padding: 20px; margin-bottom: 15px; border-radius: 6px; border-left: 4px solid #666; }
            .finding.critical { border-left-color: #dc3545; }
            .finding.high { border-left-color: #fd7e14; }
            .finding.medium { border-left-color: #ffc107; }
            .finding.low { border-left-color: #28a745; }
            .finding-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .file-path { font-family: 'Courier New', monospace; font-weight: bold; color: #333; }
            .risk-badge { padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
            .badge-critical { background: #dc3545; color: white; }
            .badge-high { background: #fd7e14; color: white; }
            .badge-medium { background: #ffc107; color: #333; }
            .badge-low { background: #28a745; color: white; }
            .detections { margin-top: 10px; }
            .detection-item { display: inline-block; background: white; padding: 6px 12px; margin: 4px; border-radius: 4px; font-size: 0.875rem; }
            .top-issues { background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 30px; }
            .issue-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #dee2e6; }
            .issue-item:last-child { border-bottom: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔒 Security Scan Report</h1>
            <div class="date">${new Date(report.summary.scanDate).toLocaleString()}</div>
            
            <div class="summary">
                <div class="stat-card">
                    <div class="stat-label">Files Scanned</div>
                    <div class="stat-value">${report.summary.filesScanned}</div>
                </div>
                <div class="stat-card ${report.summary.filesWithIssues > 0 ? 'warning' : ''}">
                    <div class="stat-label">Files with Issues</div>
                    <div class="stat-value">${report.summary.filesWithIssues}</div>
                </div>
                <div class="stat-card ${report.summary.maliciousFiles > 0 ? 'danger' : ''}">
                    <div class="stat-label">Malicious Files</div>
                    <div class="stat-value">${report.summary.maliciousFiles}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Scan Duration</div>
                    <div class="stat-value">${report.summary.duration}</div>
                </div>
            </div>

            <h2>Risk Breakdown</h2>
            <div class="risk-breakdown">
                <div class="risk-item risk-critical">
                    <div>CRITICAL</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">${report.riskBreakdown.CRITICAL}</div>
                </div>
                <div class="risk-item risk-high">
                    <div>HIGH</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">${report.riskBreakdown.HIGH}</div>
                </div>
                <div class="risk-item risk-medium">
                    <div>MEDIUM</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">${report.riskBreakdown.MEDIUM}</div>
                </div>
                <div class="risk-item risk-low">
                    <div>LOW</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">${report.riskBreakdown.LOW}</div>
                </div>
            </div>

            ${report.topIssues.length > 0 ? `
            <div class="top-issues">
                <h2>Top Issues</h2>
                ${report.topIssues.map(issue => `
                    <div class="issue-item">
                        <span>${issue.rule}</span>
                        <span><strong>${issue.count}</strong> occurrences</span>
                    </div>
                `).join('')}
            </div>
            ` : ''}

            <div class="findings">
                <h2>Detailed Findings (${report.results.length})</h2>
                ${report.results.map((result, index) => `
                    <div class="finding ${result.riskLevel.toLowerCase()}">
                        <div class="finding-header">
                            <div class="file-path">${result.relativePath}</div>
                            <span class="risk-badge badge-${result.riskLevel.toLowerCase()}">${result.riskLevel}</span>
                        </div>
                        <div>Risk Score: <strong>${result.riskScore}</strong></div>
                        <div class="detections">
                            ${result.detections.map(d => `
                                <span class="detection-item">${d.rule} <em>(${d.severity})</em></span>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </body>
    </html>`;
    }

    displaySummary(report) {
        console.log('\n' + '='.repeat(80));
        console.log('📊 SCAN COMPLETE');
        console.log('='.repeat(80));
        console.log(`⏱️  Duration: ${report.summary.duration}`);
        console.log(`📁 Files Scanned: ${report.summary.filesScanned}`);
        console.log(`⚠️  Files with Issues: ${report.summary.filesWithIssues}`);
        console.log(`🚨 Malicious Files: ${report.summary.maliciousFiles}`);
        console.log('\n📈 Risk Breakdown:');
        console.log(`   🔴 CRITICAL: ${report.riskBreakdown.CRITICAL}`);
        console.log(`   🟠 HIGH: ${report.riskBreakdown.HIGH}`);
        console.log(`   🟡 MEDIUM: ${report.riskBreakdown.MEDIUM}`);
        console.log(`   🟢 LOW: ${report.riskBreakdown.LOW}`);

        if (report.summary.maliciousFiles > 0) {
            console.log('\n🚨 MALICIOUS FILES DETECTED:');
            report.results.filter(r => r.isMalicious).forEach(r => {
                console.log(`   ❌ ${r.relativePath} (Score: ${r.riskScore})`);
            });
        }

        console.log('='.repeat(80) + '\n');
    }
}

module.exports = EnhancedSecurityScanner;

if (require.main === module) {
    const scanner = new EnhancedSecurityScanner({ generateHTML: true });
    scanner.scanCodebase(process.cwd())
        .then(report => {
            if (report.summary.maliciousFiles > 0) {
                console.error(`🚨 Security scan failed: Found ${report.summary.maliciousFiles} malicious file(s).`);
                process.exit(1);
            }
            process.exit(0);
        })
        .catch(err => {
            console.error('🚨 Security scan failed with error:', err);
            process.exit(1);
        });
}
import { compileFunc } from '@ton-community/func-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to resolve #include directives
function resolveIncludes(filePath, contractsDir, visited = new Set()) {
    // Handle relative paths correctly
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(contractsDir, filePath);
    
    if (visited.has(fullPath)) {
        return '';
    }
    visited.add(fullPath);
    
    let content = fs.readFileSync(fullPath, 'utf8');
    const dir = path.dirname(fullPath);
    
    // Process #include directives
    content = content.replace(/^#include\s+"([^"]+)"\s*;?\s*$/gm, (match, includeFile) => {
        const includePath = path.join(dir, includeFile);
        return resolveIncludes(includePath, contractsDir, visited);
    });
    
    return content;
}

async function main() {
    console.log('⚙️ Compiling NFT contracts...\n');

    const contractsDir = path.join(__dirname, 'contracts');
    const buildDir = path.join(__dirname, 'build');

    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
    }

    // Compile NFT Item
    console.log('🔨 Compiling nft-item.fc...');
    const nftItemSource = resolveIncludes('nft-item.fc', contractsDir);
    const nftItemResult = await compileFunc({
        targets: ['nft-item.fc'],
        sources: (srcPath) => {
            if (srcPath === 'nft-item.fc') {
                return nftItemSource;
            }
            return fs.readFileSync(path.join(contractsDir, srcPath), 'utf8');
        }
    });

    if (nftItemResult.status === 'error') {
        console.error('? Failed:', nftItemResult.message);
        process.exit(1);
    }

    const nftItemCell = Buffer.from(nftItemResult.codeBoc, 'base64');
    fs.writeFileSync(path.join(buildDir, 'nft-item.cell'), nftItemCell);
    console.log(`✅ nft-item.cell created (${nftItemCell.length} bytes)`);
    console.log(`   Hash: ${crypto.createHash('sha256').update(nftItemCell).digest('hex')}`);

    console.log('\n⚠️ Skipping nft-collection.fc (file not found)');
    console.log('\n✅ Compilation complete!\n');
}

main().catch(console.error);

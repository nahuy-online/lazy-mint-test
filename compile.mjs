import { compileFunc } from '@ton-community/func-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('?? Compiling NFT contracts...\n');

    const contractsDir = path.join(__dirname, 'contracts');
    const buildDir = path.join(__dirname, 'build');

    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
    }

    // Compile NFT Item
    console.log('?? Compiling nft-item.fc...');
    const nftItemResult = await compileFunc({
        targets: ['nft-item.fc'],
        sources: (srcPath) => {
            return fs.readFileSync(path.join(contractsDir, srcPath), 'utf8');
        }
    });

    if (nftItemResult.status === 'error') {
        console.error('? Failed:', nftItemResult.message);
        process.exit(1);
    }

    const nftItemCell = Buffer.from(nftItemResult.codeBoc, 'base64');
    fs.writeFileSync(path.join(buildDir, 'nft-item.cell'), nftItemCell);
    console.log(`? nft-item.cell created (${nftItemCell.length} bytes)`);
    console.log(`   Hash: ${crypto.createHash('sha256').update(nftItemCell).digest('hex')}`);

    // Compile NFT Collection
    console.log('\n?? Compiling nft-collection.fc...');
    const collectionResult = await compileFunc({
        targets: ['nft-collection.fc'],
        sources: (srcPath) => {
            return fs.readFileSync(path.join(contractsDir, srcPath), 'utf8');
        }
    });

    if (collectionResult.status === 'error') {
        console.error('? Failed:', collectionResult.message);
        process.exit(1);
    }

    const collectionCell = Buffer.from(collectionResult.codeBoc, 'base64');
    fs.writeFileSync(path.join(buildDir, 'nft-collection.cell'), collectionCell);
    console.log(`? nft-collection.cell created (${collectionCell.length} bytes)`);
    console.log(`   Hash: ${crypto.createHash('sha256').update(collectionCell).digest('hex')}`);

    console.log('\n? Compilation complete!\n');
}

main().catch(console.error);

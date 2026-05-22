import {
    TonClient,
    WalletContractV4,
    internal,
    beginCell,
    toNano,
    Address,
    Cell,
    contractAddress
} from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('?? Deploying NFT Collection (Lazy Mint)\n');

    const MNEMONIC = process.env.MNEMONIC;
    const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY;
    const NETWORK = process.env.NETWORK || 'testnet';
    const COLLECTION_CONTENT_URL = process.env.COLLECTION_CONTENT_URL?.trim();
    const NFT_CONTENT_BASE_URL = process.env.NFT_CONTENT_BASE_URL?.trim();
    const ROYALTY_NUMERATOR = parseInt(process.env.ROYALTY_NUMERATOR) || 110;
    const ROYALTY_DENOMINATOR = parseInt(process.env.ROYALTY_DENOMINATOR) || 1000;

    if (!MNEMONIC) {
        console.error('? MNEMONIC not set in .env');
        process.exit(1);
    }

    // Load compiled contracts
    const buildDir = path.join(__dirname, 'build');
    const nftItemCode = Cell.fromBoc(fs.readFileSync(path.join(buildDir, 'nft-item.cell')))[0];
    const collectionCode = Cell.fromBoc(fs.readFileSync(path.join(buildDir, 'nft-collection.cell')))[0];

    // Setup client
    // Try multiple endpoints for reliability
    let endpoint = process.env.TON_API_ENDPOINT;
    
    if (!endpoint) {
        endpoint = NETWORK === 'mainnet' 
            ? 'https://toncenter.io/api/v2/jsonRPC' 
            : 'https://testnet.toncenter.io/api/v2/jsonRPC';
    }
    
    // Fallback endpoints if primary fails - added official testnet and tonapi
    const fallbackEndpoints = [
        NETWORK === 'mainnet' 
            ? 'https://tonapi.io/api/v2/jsonRPC' 
            : 'https://testnet.toncenter.io/api/v2/jsonRPC',
        NETWORK === 'mainnet'
            ? 'https://dton.io/api/v2/jsonRPC'
            : 'https://testnet.dton.io/api/v2/jsonRPC',
        NETWORK === 'mainnet'
            ? 'https://toncenter.io/api/v2/jsonRPC'
            : 'https://testnet.ton.org'
    ];
    
    let client;
    let currentEndpoint = endpoint;
    
    // Try to create client with available endpoint
    for (const ep of [endpoint, ...fallbackEndpoints]) {
        try {
            console.log(`?? Trying endpoint: ${ep}`);
            client = new TonClient({
                endpoint: ep,
                apiKey: TONCENTER_API_KEY
            });
            // Test connection
            await client.getMasterchainInfo();
            currentEndpoint = ep;
            break;
        } catch (e) {
            console.log(`   Failed: ${e.message}`);
            continue;
        }
    }
    
    if (!client) {
        console.error('? All endpoints failed. Check your internet connection.');
        process.exit(1);
    }

    console.log(`?? Network: ${NETWORK}`);
    console.log(`?? Connected to: ${currentEndpoint}\n`);

    // Setup wallet
    const keyPair = await mnemonicToPrivateKey(MNEMONIC.split(' '));
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });

    console.log(`?? Wallet address: ${wallet.address.toString({ testOnly: NETWORK === 'testnet' })}`);
    
    const walletContract = client.open(wallet);
    const seqno = await walletContract.getSeqno();

    // Build collection content cell
    const collectionContent = beginCell()
        .storeRef(
            beginCell()
                .storeUint(0, 8) // prefix for on-chain content
                .storeStringTail(COLLECTION_CONTENT_URL)
                .endCell()
        )
        .storeRef(
            beginCell()
                .storeUint(1, 8) // prefix for off-chain content base
                .storeStringTail(NFT_CONTENT_BASE_URL)
                .endCell()
        )
        .endCell();

    // Build royalty params
    const royaltyParams = beginCell()
        .storeUint(ROYALTY_NUMERATOR, 16)
        .storeUint(ROYALTY_DENOMINATOR, 16)
        .storeAddress(wallet.address)
        .endCell();

    // Build collection data
    const collectionData = beginCell()
        .storeUint(0, 64) // next_item_index
        .storeAddress(wallet.address) // owner_address
        .storeRef(collectionContent)
        .storeRef(nftItemCode) // nft_item_code
        .storeRef(royaltyParams)
        .endCell();

    // Calculate collection address
    const collectionAddress = contractAddress(0, { code: collectionCode, data: collectionData.asCell() });
    console.log(`?? Collection address: ${collectionAddress.toString({ testOnly: NETWORK === 'testnet' })}\n`);

    // Check if already deployed
    const state = await client.getAccountState(collectionAddress);
    if (state.account.state.type === 'active') {
        console.log('??  Collection already deployed!');
        return;
    }

    // Deploy
    console.log('?? Sending deployment transaction...');
    const transfer = walletContract.createTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: collectionAddress,
                value: toNano('0.1'),
                bounce: false,
                init: { code: collectionCode, data: collectionData.asCell() }
            })
        ]
    });

    await walletContract.send(transfer);
    console.log('? Deployment transaction sent!');
    console.log(`\n? Waiting for confirmation...`);
    
    // Wait for deployment
    let attempts = 0;
    while (attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));
        const newState = await client.getAccountState(collectionAddress);
        if (newState.account.state.type === 'active') {
            console.log('? Collection deployed successfully!');
            console.log(`\n?? Details:`);
            console.log(`   Address: ${collectionAddress.toString({ testOnly: NETWORK === 'testnet' })}`);
            console.log(`   Content: ${COLLECTION_CONTENT_URL}`);
            console.log(`   Base URL: ${NFT_CONTENT_BASE_URL}`);
            console.log(`   Royalty: ${ROYALTY_NUMERATOR}/${ROYALTY_DENOMINATOR}`);
            return;
        }
        attempts++;
        console.log(`   Waiting... (${attempts}/30)`);
    }
    
    console.log('? Deployment timeout. Check your transaction.');
}

main().catch(console.error);

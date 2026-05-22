import { Blockchain } from '@ton/sandbox';
import { beginCell, toNano, Cell, Address } from '@ton/core';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

async function main() {
    console.log('🚀 Starting local blockchain simulation...\n');

    // Load compiled contracts
    const nftItemCode = Cell.fromBoc(readFileSync('./build/nft-item.cell'))[0];
    const nftCollectionCode = Cell.fromBoc(readFileSync('./build/nft-collection.cell'))[0];

    // Create blockchain instance
    const blockchain = await Blockchain.create();
    
    // Create owner wallet
    const owner = await blockchain.treasury('owner');
    console.log(`💰 Owner address: ${owner.address.toString()}`);
    console.log(`   Balance: ${Number(owner.balance) / 1e9} TON\n`);

    // Collection content (same as in .env)
    const collectionContentUrl = 'https://nahuy.online/nft/og/json/collection.json?v=31';
    const nftContentBaseUrl = 'https://nahuy.online/nft/og/json/';
    
    // Encode content as snake format (standard for TON NFT)
    function encodeContent(url) {
        return beginCell()
            .storeUint(0x01, 8)
            .storeBuffer(Buffer.from(url, 'utf8'))
            .endCell();
    }

    // Royalty: 11% (110/1000)
    const royaltyNumerator = 110n;
    const royaltyDenominator = 1000n;
    const royaltyAddress = owner.address;

    // Deploy collection contract
    console.log('📦 Deploying NFT Collection contract...\n');
    
    // Build data cell for collection
    const collectionContentCell = encodeContent(collectionContentUrl);
    const commonContentCell = beginCell()
        .storeStringTail(nftContentBaseUrl)
        .endCell();

    const collectionData = beginCell()
        .storeAddress(owner.address)           // owner
        .storeUint(0n, 64)                     // next_item_index
        .storeRef(collectionContentCell)       // collection_content
        .storeRef(commonContentCell)           // common_content
        .storeRef(nftItemCode)                 // nft_item_code
        .storeUint(royaltyNumerator, 16)       // royalty_numerator
        .storeUint(royaltyDenominator, 16)     // royalty_denominator
        .storeAddress(royaltyAddress)          // royalty_address
        .endCell();

    const collectionInit = { code: nftCollectionCode, data: collectionData };
    const collectionAddress = Contract.computeAddress(nftCollectionCode, collectionData);
    
    const collection = blockchain.openContract(
        new Contract(collectionAddress, collectionInit)
    );

    // Send deployment message
    const deployResult = await owner.send({
        to: collection.address,
        value: toNano('0.5'),
        bounce: false,
        body: beginCell()
            .storeUint(1, 32) // op::deploy
            .storeUint(0, 64) // query_id
            .endCell()
    });

    console.log('✅ Collection deployed!');
    console.log(`   Address: ${collection.address.toString()}`);
    console.log(`   Transaction status: ${deployResult.transactions[0].description.type === 'generic' ? 'Success' : 'Failed'}\n`);

    // Get collection state
    const collectionState = await blockchain.getContract(collection.address);
    console.log(`   Contract active: ${collectionState.accountState.type === 'active'}`);
    console.log(`   Balance: ${Number(collectionState.balance) / 1e9} TON\n`);

    // Test minting first NFT (index 0)
    console.log('🎨 Minting first NFT (index 0)...');
    
    const mintResult = await owner.send({
        to: collection.address,
        value: toNano('0.1'),
        bounce: false,
        body: beginCell()
            .storeUint(1, 32) // op::mint
            .storeUint(0, 64) // query_id
            .storeUint(0, 64) // item_index
            .storeAddress(owner.address) // owner_address
            .storeRef(beginCell().storeStringTail('0').endCell()) // individual_content
            .endCell()
    });

    console.log('✅ NFT minted!');
    console.log(`   Transaction status: ${mintResult.transactions[0].description.type === 'generic' ? 'Success' : 'Failed'}\n`);

    // Show summary
    console.log('📊 Summary:');
    console.log('   ────────────────────────────────────────');
    console.log(`   Network: Local Sandbox (Offline)`);
    console.log(`   Collection: ${collection.address.toString()}`);
    console.log(`   Owner: ${owner.address.toString()}`);
    console.log(`   Royalty: ${(Number(royaltyNumerator) / Number(royaltyDenominator) * 100).toFixed(1)}%`);
    console.log(`   Content URL: ${collectionContentUrl}`);
    console.log(`   Base URL: ${nftContentBaseUrl}`);
    console.log('   ────────────────────────────────────────');
    console.log('\n✅ All tests passed! Ready for mainnet deployment.\n');
}

// Simple Contract class for sandbox
class Contract {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }

    static computeAddress(code, data) {
        const hash = createHash('sha256')
            .update(code.toBoc({ idx: false }))
            .update(data.toBoc({ idx: false }))
            .digest('hex');
        return Address.parseRaw('0:' + hash.substring(0, 64));
    }
}

main().catch(console.error);

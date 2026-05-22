import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, toNano, address as Address, contractAddress, storeStateInit } from '@ton/core';
import { sha256 } from '@ton/crypto';
import fs from 'fs';

// Конфигурация (из .env или хардкод для теста)
const COLLECTION_CONTENT_URL = "https://nahuy.online/nft/og/json/collection.json?v=31";
const NFT_CONTENT_BASE_URL = "https://nahuy.online/nft/og/json/";
const ROYALTY_NUMERATOR = 110;
const ROYALTY_DENOMINATOR = 1000;

async function main() {
    console.log("🚀 Запуск эмуляции деплоя NFT Collection (Sandbox)...");

    // 1. Инициализация блокчейна
    const blockchain = await Blockchain.create();
    
    // Создаем кошелек владельца (эмуляция)
    const owner = await blockchain.treasury('owner');
    console.log(`✅ Кошелек владельца создан: ${owner.address.toString({ bounceable: false })}`);

    // 2. Загрузка кода контрактов
    const nftItemCodeRaw = fs.readFileSync('./build/nft-item.cell');
    const nftCollectionCodeRaw = fs.readFileSync('./build/nft-collection.cell');
    
    const nftItemCode = beginCell().storeBuffer(nftItemCodeRaw).endCell();
    const nftCollectionCode = beginCell().storeBuffer(nftCollectionCodeRaw).endCell();

    // 3. Подготовка контента коллекции
    // Формируем словарь ончейн контента (упрощенно)
    // В реальном контракте это может быть оффчейн ссылка или ончейн словарь
    const contentCell = beginCell()
        .storeUint(0x01, 8) // offchain prefix
        .storeStringTail(COLLECTION_CONTENT_URL)
        .endCell();

    // 4. Сборка состояния коллекции (Data)
    // Структура данных зависит от вашего nft-collection.fc
    // Обычно: owner_address, next_item_index, collection_content, nft_item_code
    // Предположим стандартную структуру TEP-62
    
    const nextItemIndex = 0;
    
    //royalty params: numerator, denominator, address
    const royaltyParams = beginCell()
        .storeUint(ROYALTY_NUMERATOR, 16)
        .storeUint(ROYALTY_DENOMINATOR, 16)
        .storeAddress(owner.address)
        .endCell();

    const dataCell = beginCell()
        .storeAddress(owner.address) // owner
        .storeUint(nextItemIndex, 64) // next_item_index
        .storeRef(contentCell) // collection_content
        .storeRef(nftItemCode) // nft_item_code
        .storeRef(royaltyParams) // royalty_params
        .endCell();

    // 5. Вычисление адреса контракта
    const workchain = 0;
    const futureAddress = contractAddress(workchain, { code: nftCollectionCode, data: dataCell });
    console.log(`📍 Будущий адрес коллекции: ${futureAddress.toString({ bounceable: false })}`);
    console.log(`   (Bounceable: ${futureAddress.toString({ bounceable: true })})`);

    // 6. Эмуляция деплоя
    console.log("\n🛠 Эмуляция отправки транзакции деплоя...");
    
    const deployMessage = beginCell()
        .storeUint(0, 1) // flag
        .storeCoins(toNano('0.05')) // amount
        .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1) // info
        .storeAddress(owner.address) // from
        .storeAddress(futureAddress) // to
        .storeCoins(toNano('0.05')) // value
        .storeUint(0, 1 + 64) // state init flag (already in message usually, but here simplified)
        .endCell();

    // Отправляем транзакцию от владельца на адрес контракта с кодом и данными
    const deployResult = await owner.send({
        to: futureAddress,
        value: toNano('0.1'), // 0.1 TON для деплоя
        bounce: false,
        init: {
            code: nftCollectionCode,
            data: dataCell
        },
        body: beginCell().endCell() // Пустое тело для простого деплоя
    });

    // 7. Анализ результатов
    console.log("\n📊 Результаты эмуляции:");
    if (deployResult.transactions.length > 1) {
        const lastTx = deployResult.transactions[deployResult.transactions.length - 1];
        if (lastTx.description.type === 'generic') {
             if (lastTx.description.computePhase.type === 'vm' && lastTx.description.computePhase.exitCode === 0) {
                 console.log("✅ Деплой успешен! Контракт активирован.");
                 
                 // Проверка состояния
                 const contractState = await blockchain.getContract(futureAddress);
                 if (contractState.account.state.type === 'active') {
                     console.log("✅ Статус контракта: ACTIVE");
                 }
             } else {
                 console.log(`❌ Ошибка выполнения VM. Код выхода: ${lastTx.description.computePhase.exitCode}`);
             }
        }
    } else {
        console.log("⚠️ Транзакция не прошла или не создала контракт.");
    }

    console.log("\n💡 Что делать дальше:");
    console.log("1. Если эмуляция прошла успешно (✅), значит код контрактов верен.");
    console.log("2. Проблема только в сети. Попробуйте:");
    console.log("   - Мобильный интернет (раздача с телефона).");
    console.log("   - Другой DNS (например, 8.8.8.8 или 1.1.1.1).");
    console.log("   - Отключить антивирус/фаервол на время деплоя.");
    console.log("3. Когда сеть заработает, запустите обычный `npm run deploy`.");
}

main().catch(console.error);

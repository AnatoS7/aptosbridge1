import {createWalletsMapping, random, readWallets, shuffle} from "../utils/common.js";
import {bsc} from "../chains/bsc/index.js";
import {Wallet} from "ethers";
import {aptosBridgeTransactionsAmount} from "../src/config.js";
import fs from "fs";

export function createDatabase() {
    const database = {}
    let evmPrivateKeys = readWallets('./data/evm_private_keys.txt')
    let aptosPrivateKeys = readWallets('./data/aptos_private_keys.txt')
    let depositAddresses = readWallets('./data/deposit_addresses.txt')

    for (let [index, privateKey] of evmPrivateKeys.entries()) {
        const aptosBridgeTransactionAmount = random(aptosBridgeTransactionsAmount[0], aptosBridgeTransactionsAmount[1]);
        const evmWallet = new Wallet(privateKey, bsc.provider);
        database[evmWallet.address] = {
            aptosPrivateKey: aptosPrivateKeys[index],
            evmPrivateKey: privateKey,
            depositAddress: depositAddresses[index],
            aptosBridgeTransactionAmount,
            bridgedToAptos: false
        }
    }

    fs.writeFileSync('./storage/db.json', JSON.stringify(database, null, 2));

    return database
}


export function loadDatabase() {
    const fileContent = fs.readFileSync('./storage/db.json', 'utf-8')
    return JSON.parse(fileContent)
}

export function saveDatabase(database) {
    fs.writeFileSync('./storage/db.json', JSON.stringify(database, null, 2));
}

export function calculateTransactionsLeft(database) {
    let txSum = 0;
    for (const address in database) {
        txSum += database[address].aptosBridgeTransactionAmount
    }

    return txSum;
}
import {shuffleArray} from "./bridgeToAptos.js";
import Web3 from 'web3';
import {AptosClient} from "aptos";
import {getAptosAccountFromPrivateKey} from "../utils/aptos.js";
import {
    getAptosCoinBalance,
    isBalanceError,
    random,
    randomFloat,
    sleep,
    waitForBalance,
    withdraw
} from "../utils/common.js";
import {makeLogger} from "../utils/logger.js";
import {ethers, formatUnits, Wallet} from "ethers";
import {APTOS_NATIVE_COIN, APTOS_USDT_COIN} from "./constants.js";
import {
    bridgeFromAptosChains,
    minChainBalance,
    minEvmStableBalance, stablePercentToSendFromAptos,
    stableWithdrawAmount
} from "./config.js";
import {aptos} from "../chains/aptos/index.js";
const logger = makeLogger('bridgeFromAptos')



export const getNonceAptos = async(privateKey) => {
    const client = new AptosClient('https://rpc.ankr.com/http/aptos/v1');
    const sender =  getAptosAccountFromPrivateKey(privateKey);
    return (await client.getAccount(sender.address())).sequence_number;
}

export async function bridgeFromAptos(evmKey, aptosKey, stableToken) {
    let destChain = shuffleArray(bridgeFromAptosChains)[0];

    const { provider } = destChain
    const evmWallet = new Wallet(evmKey, provider);

    const account =  getAptosAccountFromPrivateKey(aptosKey);

    let aptosBalance = await getAptosCoinBalance(aptos.client, account, APTOS_NATIVE_COIN)
    let newAptosBalance;

    if (formatUnits(aptosBalance, 8) < minChainBalance['Aptos']) {
        await withdraw('APT', 'Aptos', account.address().toString(), false, 'okx')

        while (true) {
            try {
                newAptosBalance = await getAptosCoinBalance(aptos.client, account, APTOS_NATIVE_COIN)
                const intAptosBalance = formatUnits(newAptosBalance, 8)
                if (intAptosBalance !== formatUnits(aptosBalance, 8)) {
                    aptosBalance = intAptosBalance
                    logger.warn(`received withdraw, new balance is: ${formatUnits(newAptosBalance, 8)} APT`)
                    break
                }
                const sleepTime = random(30, 100);
                logger.warn(`waiting for withdraw of APT from okx -  ${sleepTime} seconds`)
                await sleep(sleepTime)
            } catch (e) {
                logger.error(`error - ${e}, try again in 10 sec...`)
                await sleep(10)
            }

        }
    }

    const randomPercentForBridge = randomFloat(stablePercentToSendFromAptos[0], stablePercentToSendFromAptos[1])
    const balanceToSend = stableToken.weiBalance * randomPercentForBridge
    const intBalanceToSend = parseInt(balanceToSend.toString())

    const w3 = new Web3();

    logger.info(`${account.address()} | about to bridge ${formatUnits(intBalanceToSend, 6)} ${stableToken.ticker} -> ${destChain.name}`)

    let retries = 0;
    let sleepTime;
    let fee = "11000000";
    let isWithdrawn = false;
    while (true) {
        try {
            await sendTransactionAptos({
                "function": "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::coin_bridge::send_coin_from",
                "type_arguments": [
                    stableToken.argForTransaction
                ],
                "arguments": [
                    destChain.lzChainId,
                    Buffer.from(w3.utils.hexToBytes(ethers.zeroPadValue(evmWallet.address, 32))),
                    intBalanceToSend,
                    fee,
                    "0",
                    false,
                    Buffer.from(w3.utils.hexToBytes('0x000100000000000249f0')),
                    Buffer.from('0x', 'hex')
                ],
                "type": "entry_function_payload"
            }, aptosKey);

            return destChain
        } catch (err) {
            logger.error(`${account.address()} | error occurred while bridging from aptos - ${err}`)

            if (isBalanceError(err) && !isWithdrawn) {
                logger.warn(`native balance low, withdraw from okx apt`)
                await withdraw('APT', 'Aptos', account.address().toString(), false, 'okx')

                const sleepTime = random(30, 100);
                logger.warn(`waiting for withdraw of APT from okx -  ${sleepTime} seconds`)
                await sleep(sleepTime)

                while (true) {
                    try {
                        newAptosBalance = await getAptosCoinBalance(aptos.client, account, APTOS_NATIVE_COIN)
                        const intAptosBalance = formatUnits(newAptosBalance, 8)
                        if (intAptosBalance !== aptosBalance) {
                            logger.warn(`received withdraw, new balance is: ${intAptosBalance} APT`)
                            isWithdrawn = true;
                            break
                        }
                        const sleepTime = random(30, 100);
                        logger.warn(`waiting for withdraw of APT from okx -  ${sleepTime} seconds`)
                        await sleep(sleepTime)
                    } catch (e) {
                        logger.error(`error - ${e}, try again in 10 sec...`)
                        await sleep(10)
                    }
                }
            }

            retries += 1
            if (retries === 3) {
                throw err
            }

            sleepTime = random(10, 100);
            logger.info(`sleeping and trying again - ${sleepTime} seconds....`)
            await sleep(sleepTime)
        }
    }
}

async function sendTransactionAptos(payload, privateKey, gasLimit = 12000) {
    const account =  getAptosAccountFromPrivateKey(privateKey);

    const nonce = await getNonceAptos(privateKey)
    const txnRequest = await aptos.client.generateTransaction(account.address(), payload, {
        gas_unit_price: 100,
        max_gas_amount: gasLimit,
        sequence_number: nonce
    });

    const signedTxn = await aptos.client.signTransaction(account, txnRequest);
    const transactionRes = await aptos.client.submitTransaction(signedTxn);

    await aptos.client.waitForTransactionWithResult(transactionRes.hash, { checkSuccess: true }).then(async(hash) => {
        console.log(`${account.address()} | Send TX in Aptos: https://explorer.aptoslabs.com/txn/${hash.hash}`)
    });

    logger.info(`${account.address()} | bridge from aptos success`)
}

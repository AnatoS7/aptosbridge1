import {bridgeToAptos, getTokenBalance, shuffleArray} from "./bridgeToAptos.js";
import {
    bridgeToAptosChains,
    minAptosStableBalance, minChainBalance,
    minEvmStableBalance,
    stableWithdrawAmount
} from "./config.js";
import { makeLogger } from "../utils/logger.js";
import {
    findBiggestStableBalance,
    getAptosBiggestStableCoin, getNativeBalance,
    isBalanceError,
    random,
    randomFloat,
    sleep,
    waitForBalance,
    waitForTransaction,
    withdraw
} from "../utils/common.js";
import {formatEther, Wallet, formatUnits, parseUnits} from "ethers";
import { bridgeFromAptos } from "./bridgeFromAptos.js";
import { Contract } from "ethers";
import { parseGwei } from "viem";
import {PASS} from "./constants.js";
import {bsc} from "../chains/bsc/index.js";
import {getAptosAccountFromPrivateKey} from "../utils/aptos.js";
const logger = makeLogger('volume')

async function bridgeStableCoinToAptos(evmKey, aptosKey, tgMessages) {
    let chain = shuffleArray(bridgeToAptosChains)[0];
    let { provider, stableCoin } = chain;
    let evmWallet = new Wallet(evmKey, provider);

    if (chain.name === 'Avalanche') {
        // if no gas in Avalanche - skip (wait time for withdraw is big)
        const nativeBalance = await getNativeBalance(provider, evmWallet)
        if (formatEther(nativeBalance) < minChainBalance[chain.name]) {
            chain = bsc;
            ({ provider, stableCoin } = chain);
            evmWallet = new Wallet(evmKey, provider);
        } else {
            stableCoin = await findBiggestStableBalance(evmKey, chain)
        }
    }

    const stableBalance = await getTokenBalance(evmWallet, {
        token: stableCoin,
    });
    const usdStableBalance = formatUnits(stableBalance, stableCoin.decimals)

    // withdraw USDT
    if (usdStableBalance < minEvmStableBalance) {
        while (true) {
            try {
                await withdraw(stableCoin.ticker, chain.name, evmWallet.address, true)
                const balanceForWork = await waitForBalance(stableBalance, provider, evmWallet, stableCoin)
                logger.info(`withdraw success, balance ${formatUnits(balanceForWork, stableCoin.decimals)}`)
                tgMessages.push(`${PASS} withdraw ${stableCoin.ticker} from binance to ${chain.name} success, balance ${formatUnits(balanceForWork, stableCoin.decimals)}`)
                break
            } catch (e) {
                logger.error(`error occured while withdrawing ${e}`)
                const sleepTime = random(30, 60);
                logger.info(`sleep ${sleepTime} seconds and try again`)
                await sleep(sleepTime)
            }
        }
    }

    const usdBalance = await bridgeToAptos(evmKey, aptosKey, chain, stableCoin)

    tgMessages.push(`${PASS} bridge ${usdBalance} ${stableCoin.ticker} FROM ${chain.name} -> Aptos success`)
    return stableCoin
}


export async function bridge(evmKey, aptosKey, bridgedToAptos) {
    const aptosAccount = getAptosAccountFromPrivateKey(aptosKey);
    const evmWallet = new Wallet(evmKey, bsc.provider);

    logger.info(`evm: ${evmWallet.address} | aptos: ${aptosAccount.address().toString()}`)

    const tgMessages = [evmWallet.address]

    const biggestStableCoin = await getAptosBiggestStableCoin(aptosKey)

    if (biggestStableCoin.usdBalance < minAptosStableBalance) {
        // bridge to aptos and continue to next account
        if (!bridgedToAptos) {
            await bridgeStableCoinToAptos(evmKey, aptosKey, tgMessages)
            return {
                bridgeToAptos: true,
                tgMessages: tgMessages,
            }
        }

        logger.warn('stable balance on aptos low, but already bridged to aptos, probably hasnt arrived yet, skip to next')
        tgMessages.push('stable balance on aptos low, but already bridged to aptos, probably hasnt arrived yet, skip to next')
        return {
            tgMessages: tgMessages,
        }
    }

    const destChain = await bridgeFromAptos(evmKey, aptosKey, biggestStableCoin)
    tgMessages.push(`${PASS} bridge APTOS -> ${destChain.name}`)

    return {
        bridgeFromAptos: true,
        tgMessages: tgMessages,
    }
}
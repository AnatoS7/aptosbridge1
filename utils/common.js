import {
    minAptosStableBalance,
    minBalanceInMaticForTransferBack,
    stableWithdrawAmount,
    TG_ID,
    withdrawConfig
} from "../src/config.js";
import {Binance} from "../exchanges/binance.js";
import {makeLogger} from "./logger.js";
import {chains} from "../chains/index.js";
import BigNumber from "bignumber.js";
import {Contract, formatEther, formatUnits, parseEther, parseUnits, Wallet} from "ethers";
import {
    APPROVAL_AMOUNT_MULTIPLIER,
    APTOS_NATIVE_COIN,
    APTOS_USDC_COIN,
    APTOS_USDC_TYPED,
    APTOS_USDT_COIN, APTOS_USDT_TYPED
} from "../src/constants.js";
import axios from "axios";
import {getTokenBalance, shuffleArray} from "../src/bridgeToAptos.js";
import { parseGwei } from "viem"
import {aptos} from "../chains/aptos/index.js";
import {OKX} from "../exchanges/okx.js";
import {getAptosAccountFromPrivateKey} from "./aptos.js";
import fs from "fs";
const logger = makeLogger('utils')

export function random(min, max) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1) + min)
}

export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export const sleep = async (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000))


export async function withdraw(coin, network, address, stableCoin = false, exchange = 'binance'){
    while (true) {
        try {
            let withdrawRange = stableCoin ? stableWithdrawAmount : withdrawConfig[network].sum
            let sum = randomFloat(withdrawRange[0], withdrawRange[1])

            const tokenPrice = await getCurrentPrice(coin)
            const tokenCount = sum / tokenPrice

            logger.info(`${address} | ${network} | withdrawing ${tokenCount} ${coin} from ${exchange}`);

            if (exchange === 'binance') {
                const binance = new Binance()
                await binance.withdraw(address, network, coin, tokenCount.toString())
            } else {
                const okx = new OKX()
                await okx.withdraw(address, aptos.name, aptos.nativeToken.ticker, tokenCount.toString())
            }

            break
        } catch(error) {
            logger.error(`${address} | ${exchange} | error while withdrawing ${coin} - ${error}`)
            await sleep(5)
        }
    }
}

export async function getNativeBalance(provider, evmWallet) {
    while(true) {
        try {
            return await provider.getBalance(evmWallet.address);
        } catch (error) {
            logger.error(`error getting balanace trying again - ${error}`)
            await sleep(5)
        }
    }
}

export async function getAptosCoinBalance(client, sender, coin) {
    while(true) {
        try {
            const aptosResource = await client.getAccountResource(sender.address(), coin)
            return aptosResource.data.coin.value;
        } catch (error) {
            logger.error(`error getting balanace trying again - ${error}`)
            await sleep(5)
        }
    }
}


export async function waitForBalance(oldBalance, provider, evmWallet, token = undefined){
    let newBalance
    if (token) {
        newBalance = await getTokenBalance(evmWallet, {
            token: token,
        });
    } else {
        newBalance = await getNativeBalance(provider, evmWallet)
    }

    while (newBalance <= oldBalance) {
        logger.info(`waiting for withdraw/bridge, current balance: ${formatEther(newBalance)}`)
        const sleepTime = random(30, 100);
        await sleep(sleepTime)
        if (token) {
            newBalance = await getTokenBalance(evmWallet, {
                token: token,
            });
        } else {
            newBalance = await getNativeBalance(provider, evmWallet)
        }
    }
    return newBalance
}

export const getChainByWallet = async (wallet) => {
    const { chainId } = await wallet.provider.getNetwork();
    return getChainById(chainId);
};

export const getChainById = (id) => {
    return Object.values(chains).find((chain) => chain.chainId === Number(id));
};


export const approveToken = async (wallet, { amount, token, spender, chain }) => {
    const bnAmount = new BigNumber(amount);

    const tokenContract = new Contract(token.address, token.abi, wallet);

    const allowance = await tokenContract.allowance(wallet.address, spender);
    if (bnAmount.gt(allowance)) {
        while (true) {
            try {
                const humanAmount = formatUnits(amount.toString(), token.decimals)
                const randomMultiplier = randomFloat(1, APPROVAL_AMOUNT_MULTIPLIER)
                const approveAmount = humanAmount * randomMultiplier

                logger.info(`Approving ${approveAmount} ${token.ticker}...`)

                let feeData = await wallet.provider.getFeeData();
                let fee = feeData.gasPrice
                if (chain.name === 'BSC') {
                    const randomBscGwei = randomFloat(1, 1.1).toString()
                    fee = parseGwei(randomBscGwei)
                }

                const tx = await tokenContract.approve(
                    spender,
                    parseUnits(approveAmount.toFixed(6).toString(), token.decimals).toString(),
                    {
                        gasPrice: fee,
                    }
                );
                await wallet.provider.waitForTransaction(tx.hash, undefined, 120 * 1000);
                logger.info(`Approve success...`)
                return
            } catch (e) {
                const sleepTime = random(5, 10);
                logger.error(`error ${e} while approving token, trying again in ${sleepTime} seconds`)
                await sleep(sleepTime)
            }
        }
    }
};

export async function getCurrentPrice(symbol = 'ETH') {
    return await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`).then(response => {
        return response.data.USD
    });
}

export function isBalanceError(error) {
    return error.toString().includes('insufficient funds') ||
        error.toString().includes('exceeds the balance') ||
        error.toString().includes('Not enough balance') ||
        error.toString().includes('gas required exceeds allowance') ||
        error.toString().includes('insufficient balance') ||
        error.toString().includes('missing revert data') ||
        error.toString().includes('EINSUFFICIENT_BALANCE') ||
        error.toString().includes('Execution reverted for an unknown reason');
}

export const convertNativeForRefuel = async ({ fromChain, toChain, amount }) => {
    const { nativeToken: fromNativeToken } = fromChain;
    const { nativeToken: toNativeToken } = toChain;

    const fromNativeTokenPrice = await getCurrentPrice(fromNativeToken.ticker)
    const toNativeTokenPrice = await getCurrentPrice(toNativeToken.ticker)


    return new BigNumber(amount)
        .dividedBy(10 ** 18)
        .multipliedBy(fromNativeTokenPrice)
        .dividedBy(toNativeTokenPrice)
        .multipliedBy(10 ** 18)
        .integerValue(BigNumber.ROUND_FLOOR)
        .toString();
};

export const sendTx = async (wallet, txData, chain, gasParams) => {
    let populatedTx;

    try {
        if (gasParams) {
            throw new Error();
        }

        let feeData = await wallet.provider.getFeeData();
        feeData = feeData.gasPrice
        if (chain.name === 'BSC') {
            const randomBscGwei = randomFloat(1, 1.1).toString()
            feeData = parseGwei(randomBscGwei)
        }

        populatedTx = await wallet.populateTransaction({
            ...txData,
            gasPrice: feeData,
        });
    } catch(e) {
        logger.error(e)
        populatedTx = await wallet.populateTransaction({
            ...txData,
            ...(gasParams || {}),
        });
    }
    const tx = await wallet.sendTransaction(populatedTx);
    logger.info(`Sent tx > ${chain.scan}${tx.hash}`);

    await waitForTransaction(tx.hash, wallet.provider)
};

export async function waitForTransaction (hash, provider) {
    const res = await provider.waitForTransaction(hash, undefined, 120 * 1000);
    if (res && res.status === 1) {
        console.log({
            message: 'The transaction is fully confirmed in the blockchain',
        });
        return true;
    } else {
        console.log({
            message: 'Transaction reverted. ',
        });

        throw new Error('Transaction reverted. ')
    }
}

export async function getAptosBiggestStableCoin (aptosKey){
    const aptosAccount = getAptosAccountFromPrivateKey(aptosKey);

    const aptosWeiUsdtBalance = await getAptosCoinBalance(aptos.client, aptosAccount, APTOS_USDT_COIN)
    const aptosWeiUsdcBalance = await getAptosCoinBalance(aptos.client, aptosAccount, APTOS_USDC_COIN)

    const aptosHumanUsdtBalance = parseFloat(formatUnits(aptosWeiUsdtBalance, 6))
    const aptosHumanUsdcBalance = parseFloat(formatUnits(aptosWeiUsdcBalance, 6))

    if (aptosHumanUsdtBalance > aptosHumanUsdcBalance) {
        return {
            coin: APTOS_USDT_COIN,
            weiBalance: aptosWeiUsdtBalance,
            usdBalance: aptosHumanUsdtBalance,
            ticker: 'USDT',
            argForTransaction: APTOS_USDT_TYPED
        }
    }

    return {
        coin: APTOS_USDC_COIN,
        weiBalance: aptosWeiUsdcBalance,
        usdBalance: aptosHumanUsdcBalance,
        ticker: 'USDC',
        argForTransaction: APTOS_USDC_TYPED
    }
}

export function shuffle(array) {
    let currentIndex = array.length,  randomIndex
    while (currentIndex > 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
    }

    return array
}

export function readWallets(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        return fileContent.split('\n').map(line => line.trim()).filter(line => line !== '')
    } catch (error) {
        console.error('Error reading the file:', error.message)
        return []
    }
}

export function createWalletsMapping(evmPrivateKeys, aptosPrivateKeys, depositAddresses) {
    const mapping = {}
    for (let [index, privateKey] of evmPrivateKeys.entries()) {
        mapping[privateKey] = {
            aptosPrivateKey: aptosPrivateKeys[index],
            depositAddress: depositAddresses[index],
        }
    }

    return mapping;
}

export async function sendTelegramMessages(tgMessages, bot) {
    const strMessagesToSend = tgMessages.join('\n')
    if (TG_ID !== -1) {
        try {
            await bot.telegram.sendMessage(TG_ID, strMessagesToSend)
        } catch (error) {
            logger.error(`failed sending tg message ${error}`)
        }
    }
}

export async function findBiggestStableBalance(evmKey, chain) {
    let biggestStable = {
        usdValue: 0,
        coin: shuffleArray(chain.contracts.tokens)[0]
    };
    const { provider, contracts } = chain;
    const evmWallet = new Wallet(evmKey, provider);

    for (const stableCoin of contracts.tokens) {
        const stableBalance = await getTokenBalance(evmWallet, {
            token: stableCoin,
        });
        const usdStableBalance = parseFloat(formatUnits(stableBalance, stableCoin.decimals))

        if (usdStableBalance > biggestStable.usdValue) {
            biggestStable.usdValue = usdStableBalance
            biggestStable.coin = stableCoin
        }
    }

    return biggestStable.coin
}

export async function depositAllStablesToCex(evmKey, depositAddress, chain) {
    let sleepTime;
    let retries = 0
    const { provider, contracts } = chain;
    const evmWallet = new Wallet(evmKey, provider);
    let nativeWithdrawn = false

    for (const stableCoin of contracts.tokens) {
        const stableBalance = await getTokenBalance(evmWallet, {
            token: stableCoin,
        });
        const usdStableBalance = parseFloat(formatUnits(stableBalance, stableCoin.decimals))
        if (usdStableBalance < minBalanceInMaticForTransferBack) {
            logger.warn(`stable balance (${usdStableBalance} ${stableCoin.ticker}) on ${chain.name} is less then configured amount for transfer back (${minBalanceInMaticForTransferBack})`)
            continue
        }
        
        while (true) {
            try {
                logger.info(`will send ${usdStableBalance} ${stableCoin.ticker}, from ${chain.name} -> ${depositAddress}`)

                const tokenContract = new Contract(stableCoin.address, stableCoin.abi, evmWallet);
                const res = await tokenContract.transfer(depositAddress, stableBalance)
                logger.info(`Sent tx > ${chain.scan}${res.hash}`);

                await waitForTransaction(res.hash, provider)

                sleepTime = random(10, 30);
                logger.info(`sleep ${sleepTime} seconds`)
                await sleep(sleepTime)

                break
            } catch (e) {
                logger.error(e)

                if (isBalanceError(e) && !nativeWithdrawn) {
                    logger.warn(`native balance low, withdraw from binance`)
                    const oldBalance = await provider.getBalance(evmWallet.address);

                    await withdraw(chain.nativeToken.ticker, chain.name, evmWallet.address)
                    const newBalance = await waitForBalance(oldBalance, provider, evmWallet)

                    logger.info(`withdraw success, balance ${formatEther(newBalance)}`)
                    nativeWithdrawn = true
                }

                retries += 1
                if (retries === 3) {
                    throw e
                }

                sleepTime = random(10, 30);
                logger.info(`try again after ${sleepTime} seconds`)
                await sleep(sleepTime)
            }
        }
    }
}

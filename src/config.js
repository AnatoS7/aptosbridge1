import {bsc} from "../chains/bsc/index.js";
import {avalanche} from "../chains/avalanche/index.js";
import {polygon} from "../chains/polygon/index.js";

// in $ value
export const withdrawConfig = {
    'BSC': {
        sum: [1.3, 1.7],
        cex: 'binance'
    },
    'Avalanche': {
        sum: [1.3, 1.7],
        cex: 'binance'
    },
    'Aptos': {
        sum: [1.5, 2],
        cex: 'okx'
    },
}

export const bridgeFromAptosChains = [polygon]

export const bridgeToAptosChains = [avalanche, bsc]

export const sleepBetweenAccounts = [10, 100]

export const minChainBalance = {
    'BSC': 0.00205,
    'Avalanche': 0.02,
    'Aptos': 0.05
}

export const binanceConfig = {
    key: '',
    secret: '',
    proxy: ''
}

export const okxConfig = {
    key: '',
    secret: '',
    passphrase: '',
    proxy: ''
}

export const minAptosStableBalance = 0.0001
export const aptosBridgeTransactionsAmount = [15, 16]
export const stableWithdrawAmount = [0.5, 2.1]
export const minEvmStableBalance = 0.005

export const stablePercentToSendFromAptos = [0.10, 0.15]

export const minBalanceInMaticForTransferBack = 1
export const shouldTransferBackToCEX = false

export const TG_TOKEN = ''
export const TG_ID = -1

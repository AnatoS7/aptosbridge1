# AptosBridgeCheap
1. if stable balance low on aptos, bridge from BSC/AVAX (if no stable balance on EVM, withdraw from binance) -> Aptos
2. when stable balance in aptos is more then configured, do brdiges from Aptos -> Polygon
3. Every transaction is random wallet from Database
4. Database is created at start of script, so if something goes wrong you can turn on again

## Requirements
`node 18`

## Install
`npm install`

## Start
1. fill aptos private keys in `data/aptos_private_keys.txt`
2. fill evm private keys in `data/evm_private_keys.txt`
3. fill binance deposit addresses in `data/deposit_addresses.txt`

`npm start`

## Logic
1. Creates Database based on input `aptosBridgeTransactionsAmount`
2. Choose random wallet every time and check biggest stablecoin (USDC/USDT) balance in Aptos, if bigger then `minAptosStableBalance`, then bridge Aptos->Polygon (`stablePercentToSendFromAptos`)  
3. If no balance in Aptos, Bridge from BSC/AVAX -> APTOS
4. If no balance in BSC/AVAX, withdraw from binance
5. At the end can deposit back to binance, IF `shouldTransferBackToCEX` & Balance on matic is bigger then `minBalanceInMaticForTransferBack`

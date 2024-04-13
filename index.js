import {bridge} from "./src/bridge.js";
import {depositAllStablesToCex, random, sendTelegramMessages, shuffle, sleep} from "./utils/common.js";
import {makeLogger} from "./utils/logger.js";
import {shouldTransferBackToCEX, sleepBetweenAccounts, TG_ID, TG_TOKEN} from "./src/config.js";
import {calculateTransactionsLeft, createDatabase, loadDatabase, saveDatabase} from "./database/database.js";
import {ERROR} from "./src/constants.js";
import {Telegraf} from "telegraf";
import {polygon} from "./chains/polygon/index.js";
const logger = makeLogger('index')

const main = async () => {
    let database;
    let tgMessages;
    let bridgeFromAptos;
    let bridgeToAptos;

    const bot = new Telegraf(TG_TOKEN)
    database = loadDatabase()

    if (!database || Object.keys(database).length === 0) {
        database = createDatabase()
    }

    while (true) {
        tgMessages = []
        try {
            const databaseEntries = Object.keys(database)
            if (databaseEntries.length === 0) {
                logger.info(`completed working, exit ....`)
                tgMessages.push('APTOS BRIDGE\nfinished work')
                break
            }

            const randomEntries = shuffle(databaseEntries);
            const address = randomEntries[0];

            ({ tgMessages, bridgeFromAptos, bridgeToAptos } = await bridge(database[address].evmPrivateKey, database[address].aptosPrivateKey,  database[address].bridgedToAptos))

            if (bridgeToAptos) {
                database[address].bridgedToAptos = true;
            }

            else if (bridgeFromAptos) {
                database[address].aptosBridgeTransactionAmount -= 1
                if (database[address].aptosBridgeTransactionAmount === 0) {
                    if (shouldTransferBackToCEX) {
                        depositAllStablesToCex(database[address].evmPrivateKey, database[address].depositAddress, polygon).catch((e) => {
                            logger.error(`error occured while trying to depositAllStables to CEX - ${e}`)
                        })
                    }
                    delete database[address]
                }
            }

            saveDatabase(database);

        } catch (err) {
            logger.error(`error occured while performing aptosBridge - ${err}`)
            tgMessages.push(` ${ERROR} error occured while performing aptosBridge - ${err}`)
        } finally {
            const dbEntries = Object.keys(database)
            const txLeft = calculateTransactionsLeft(database)
            tgMessages.push(`accounts left: ${dbEntries.length}, tx left: ${txLeft}`)
            await sendTelegramMessages(tgMessages, bot)

            const sleepTime = random(sleepBetweenAccounts[0], sleepBetweenAccounts[1]);
            logger.info(`accounts left: ${dbEntries.length}, tx left: ${txLeft}`)
            logger.info(`sleep ${sleepTime} seconds and continue to next account`)
            await sleep(sleepTime)
        }
    }
};

main()
    .then(r => console.log('completed run'))
    .catch(e => console.error(`unexpected error ${e}`))

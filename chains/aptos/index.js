import {AptosClient} from "aptos";

const client = new AptosClient('https://rpc.ankr.com/http/aptos/v1');

export const aptos = {
  name: "Aptos",
  nativeToken: {
    ticker: "APT",
    coinGeckoId: "aptos",
    decimals: 8,
  },
  client
};

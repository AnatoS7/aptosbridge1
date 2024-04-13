import { JsonRpcProvider } from "ethers";

import {USDC} from "./usdc/index.js";
import {USDT} from "./usdt/index.js";

const provider = new JsonRpcProvider("https://1rpc.io/matic");

export const polygon = {
  scan: "https://polygonscan.com/tx/",
  name: "Polygon",
  provider,
  stableCoin: USDC,
  nativeToken: {
    ticker: "MATIC",
    decimals: 18,
  },
  contracts: {
    tokens: [USDC, USDT],
  },
  chainId: 137,
  lzChainId: 109,
};

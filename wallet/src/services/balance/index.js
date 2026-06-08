/**
 * Balance Service — public API.
 *
 * Import only from this file. The internal modules (confirmed-repo,
 * pending-repo, trigger-hub, balance-service, asset-key,
 * pending-state-machine) are implementation details.
 *
 * See `.meshkore/docs/security/balance-service.md` for the contract.
 */

export {
  BalanceService, balanceService,
} from './balance-service';

export {
  CHAIN, KIND,
  BTC_KEY, ADA_KEY,
  makeAssetKey, parseAssetKey, isValidAssetKey,
  charmKey, cntKey,
} from './asset-key';

export {
  STATE as PENDING_STATE,
  EVENT as PENDING_EVENT,
  isTerminal, isLive,
} from './pending-state-machine';

export { TriggerHub, triggerHub } from './trigger-hub';

export { useBalance, useInTransit } from './use-balance';

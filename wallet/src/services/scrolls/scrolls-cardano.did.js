/**
 * Scrolls Cardano Canister Candid Interface
 * Canister ID: tty7k-waaaa-aaaak-qvngq-cai
 *
 * Methods:
 *   sign(tx_hex: text) -> Result
 *   certify_final(tx_hex: text) -> Result
 *   finality_vkey() -> Result
 */

// IDL Factory for @dfinity/agent Actor
export const idlFactory = ({ IDL }) => {
  const Result = IDL.Variant({
    Ok: IDL.Text,
    Err: IDL.Text,
  });

  return IDL.Service({
    sign: IDL.Func([IDL.Text], [Result], []),
    certify_final: IDL.Func([IDL.Text], [Result], []),
    finality_vkey: IDL.Func([], [Result], []),
  });
};

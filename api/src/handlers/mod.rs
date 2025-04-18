#[path = "bitcoin-cli/mod.rs"]
mod bitcoin_cli;
#[path = "bitcoin-rpc/mod.rs"]
mod bitcoin_rpc;
mod health;
mod spell;

pub use bitcoin_cli::broadcast_btc_tx;
pub use bitcoin_cli::estimatefee;
pub use bitcoin_cli::getrawtransaction;
pub use bitcoin_cli::gettransaction;
pub use bitcoin_cli::listunspent;
pub use bitcoin_cli::sendrawtransaction;
pub use bitcoin_cli::sendrawtransactionbroadcast;
pub use bitcoin_cli::submitpackagebroadcast;
pub use bitcoin_rpc::get_prev_txs;
pub use health::health_check;
pub use spell::prove_spell;

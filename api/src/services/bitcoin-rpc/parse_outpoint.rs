use crate::error::{WalletError, WalletResult};
use bitcoin::{OutPoint, Txid};
use std::str::FromStr;

// Parse outpoint string (txid:vout)
pub fn parse_outpoint(s: &str) -> WalletResult<OutPoint> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return Err(WalletError::BitcoinError(
            "Invalid UTXO format. Expected txid:vout".to_string(),
        ));
    }

    let txid = Txid::from_str(parts[0])
        .map_err(|e| WalletError::BitcoinError(format!("Invalid txid: {}", e)))?;
    let vout = parts[1]
        .parse::<u32>()
        .map_err(|e| WalletError::BitcoinError(format!("Invalid vout: {}", e)))?;

    Ok(OutPoint::new(txid, vout))
}

use axum::response::{IntoResponse, Response};
use http::StatusCode;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BitcoinCliError {
    #[error("Command execution failed: {0}")]
    CommandError(#[from] std::io::Error),

    #[error("JSON parsing failed: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Other error: {0}")]
    Other(String),
}

impl IntoResponse for BitcoinCliError {
    fn into_response(self) -> Response {
        let status = match self {
            BitcoinCliError::CommandError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            BitcoinCliError::JsonError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            BitcoinCliError::Other(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = self.to_string();

        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, BitcoinCliError>;

// Execute bitcoin-cli command
pub fn execute_bitcoin_cli(args: &[&str]) -> Result<Vec<u8>> {
    use std::{
        env,
        process::{Command, Stdio},
    };

    // Get network from environment
    let network = env::var("BITCOIN_NETWORK").unwrap_or_else(|_| "testnet4".to_string());
    let network_arg = format!("-{}", network);

    // Log command for debugging
    tracing::debug!(
        "Executing bitcoin-cli command: bitcoin-cli {} {}",
        network_arg,
        args.join(" ")
    );

    let b_cli = Command::new("bitcoin-cli")
        .arg(&network_arg)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let output = b_cli.wait_with_output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!("bitcoin-cli command failed: {}", stderr);
        return Err(BitcoinCliError::Other(format!(
            "bitcoin-cli command failed: {}",
            stderr
        )));
    }

    Ok(output.stdout)
}

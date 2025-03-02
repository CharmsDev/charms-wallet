use bitcoin::secp256k1::{Secp256k1, XOnlyPublicKey};
use bitcoin::taproot::{LeafVersion, TaprootBuilder};
use bitcoin::ScriptBuf;
use charms;
use tracing::info;

/// Extracts the internal key from a P2TR script pubkey.
/// P2TR script format: OP_1 OP_PUSHBYTES_32 <32-byte-key>
pub fn extract_internal_key_from_p2tr(script_pubkey: &ScriptBuf) -> Option<Vec<u8>> {
    // P2TR script format: OP_1 OP_PUSHBYTES_32 <32-byte-key>
    let bytes = script_pubkey.as_bytes();
    if bytes.len() == 34 && bytes[0] == 0x51 && bytes[1] == 0x20 {
        // Extract the 32-byte key
        return Some(bytes[2..34].to_vec());
    }
    None
}

/// Generate a control block for the given script using the output from commit_tx
pub fn generate_control_block(
    commit_tx_output: &ScriptBuf,
    spell_tx_output: &ScriptBuf,
) -> Option<String> {
    // Extract the internal key from the commit_tx's output
    let internal_key_bytes = extract_internal_key_from_p2tr(commit_tx_output)?;
    let internal_key = XOnlyPublicKey::from_slice(&internal_key_bytes).ok()?;

    // Get the script from the spell_tx output
    let script = spell_tx_output.clone();

    // Use the internal key to generate the control block
    let secp = Secp256k1::new();
    let taproot_builder = TaprootBuilder::new().add_leaf(0, script.clone()).ok()?;

    let spend_info = taproot_builder.finalize(&secp, internal_key).ok()?;

    // Fixed: control_block returns an Option, not a Result
    let control_block_obj = spend_info.control_block(&(script, LeafVersion::TapScript))?;

    // Serialize the control block to hex
    Some(hex::encode(control_block_obj.serialize()))
}

/// Attempts to generate a control block using a provided public key
pub fn generate_control_block_from_key(
    public_key_hex: &str,
    spell_tx_output: &ScriptBuf,
) -> Option<String> {
    let public_key_bytes = hex::decode(public_key_hex).ok()?;
    let pubkey = XOnlyPublicKey::from_slice(&public_key_bytes).ok()?;

    // Get the script from the spell_tx output
    let script = spell_tx_output.clone();

    // Generate the control block
    let control_block_obj = charms::script::control_block(pubkey, script);

    // Serialize the control block to hex
    Some(hex::encode(control_block_obj.serialize()))
}
